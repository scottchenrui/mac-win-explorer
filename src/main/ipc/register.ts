import { BrowserWindow, ipcMain } from 'electron';
import type { CoreContext } from '../../core/context';
import { invokeHandler } from '../../core/invoke';
import { API_NAMES, IPC_CHANNEL_PREFIX, IPC_EVENT_MENU } from '../../shared/api-contract';
import { isTrustedFrame } from './frame-guard';

/**
 * 注册主进程 IPC 通道。
 *
 * 每个 API 名对应 `api:${name}` 通道，handler 就是 core/ 里的同一个实现。
 */
export function registerIpcHandlers(ctx: CoreContext): void {
  for (const name of API_NAMES) {
    ipcMain.handle(`${IPC_CHANNEL_PREFIX}${name}`, async (event, rawReq: unknown) => {
      if (!isTrustedFrame(event)) {
        return { ok: false, error: { code: 'FORBIDDEN', message: '不受信任的调用来源' } };
      }
      return invokeHandler(ctx, name, rawReq);
    });
  }

  // 进度与目录变更事件：主进程订阅后推送给所有渲染窗口
  ctx.progress.subscribe((payload) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('api:progress', payload);
    }
  });

  ctx.watchBus.subscribe((changedPath) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('api:watch', { path: changedPath });
    }
  });
}

/** 从原生菜单向渲染层发送动作（如“新建文件夹”）。
 *
 * 应用级菜单不绑定具体窗口：发给当前焦点窗口，
 * 多窗口时“新建/刷新”等动作才会落在用户正在看的那个窗口上。
 */
export function sendMenuAction(actionId: string): void {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  if (win) win.webContents.send(IPC_EVENT_MENU, actionId);
}
