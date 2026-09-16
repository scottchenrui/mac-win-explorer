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
  const registeredOwners = new Set<number>();
  for (const name of API_NAMES) {
    ipcMain.handle(`${IPC_CHANNEL_PREFIX}${name}`, async (event, rawReq: unknown) => {
      if (!isTrustedFrame(event)) {
        return { ok: false, error: { code: 'FORBIDDEN', message: '不受信任的调用来源' } };
      }
      const id = event.sender.id;
      const owner = `electron:${id}`;
      if (!registeredOwners.has(id)) {
        registeredOwners.add(id);
        event.sender.once('destroyed', () => {
          ctx.watcher.releaseOwner(owner);
          registeredOwners.delete(id);
        });
        event.sender.on('render-process-gone', () => ctx.watcher.releaseOwner(owner));
      }
      return invokeHandler(ctx, name, rawReq, owner);
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

  // 剪贴板变更：同样推给所有窗口，A 窗口复制的内容 B 窗口立即可粘贴
  ctx.clipboardBus.subscribe((payload) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('api:clipboard', payload);
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
