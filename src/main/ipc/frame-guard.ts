import { IpcMainInvokeEvent } from 'electron';

/**
 * 校验 IPC 调用来源。
 *
 * 生产环境只允许 file:// 协议的本地渲染页；开发环境额外允许本地 Vite 服务器。
 * 防御的是"某外部页面通过 BrowserWindow 注入"这种非常规攻击面。
 */
export function isTrustedFrame(event: IpcMainInvokeEvent): boolean {
  const url = event.senderFrame?.url ?? '';
  if (url.startsWith('file://')) return true;
  if (url.startsWith('http://127.0.0.1:') || url.startsWith('http://localhost:')) return true;
  return false;
}
