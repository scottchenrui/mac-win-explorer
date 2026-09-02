import { contextBridge, ipcRenderer } from 'electron';
import { API_NAMES } from '../shared/api-contract';

/**
 * preload 是渲染层与主进程之间的唯一桥梁。
 *
 * 这里通过 contextBridge 暴露一个类型安全的对象；渲染层把它当作 `Api` 使用。
 */

const api = {} as Record<string, unknown>;
for (const name of API_NAMES) {
  api[name] = (req?: unknown) => ipcRenderer.invoke(`api:${name}`, req);
}

/** 新窗口的初始目录：主进程通过 additionalArguments 注入 */
function initialPath(): string | undefined {
  const arg = process.argv.find((a) => a.startsWith('--initial-path='));
  return arg ? arg.slice('--initial-path='.length) : undefined;
}

contextBridge.exposeInMainWorld('electronAPI', {
  ...api,
  platform: process.platform,
  initialPath: initialPath(),
  /** 新建浏览窗口（传当前目录，新窗口打开同一位置） */
  newWindow: (path?: string) => ipcRenderer.invoke('win:new', path),
  onProgress: (listener: (payload: unknown) => void) => {
    const cb = (_: unknown, payload: unknown) => listener(payload);
    ipcRenderer.on('api:progress', cb);
    return () => ipcRenderer.removeListener('api:progress', cb);
  },
  onWatch: (listener: (payload: { path: string }) => void) => {
    const cb = (_: unknown, payload: { path: string }) => listener(payload);
    ipcRenderer.on('api:watch', cb);
    return () => ipcRenderer.removeListener('api:watch', cb);
  },
  onMenuAction: (listener: (actionId: string) => void) => {
    const cb = (_: unknown, actionId: string) => listener(actionId);
    ipcRenderer.on('menu:action', cb);
    return () => ipcRenderer.removeListener('menu:action', cb);
  },
  /** Dock 拖拽文件进来 */
  onOpenFile: (listener: (path: string) => void) => {
    const cb = (_: unknown, path: string) => listener(path);
    ipcRenderer.on('open-file', cb);
    return () => ipcRenderer.removeListener('open-file', cb);
  },
});
