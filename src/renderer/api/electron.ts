import { API_NAMES, type Api } from '@shared/api-contract';
import type { TransferProgress } from '@shared/types';

/**
 * Electron 通道。
 *
 * preload 通过 contextBridge 暴露的对象里，方法名与契约完全一致，
 * 所以这里只是把 window.electronAPI 断言成 Api 类型 —— 不复制任何逻辑。
 */
export interface ElectronBridge extends Api {
  platform: string;
  /** 新窗口的初始目录（由主进程注入）；首窗口为 undefined */
  initialPath?: string;
  newWindow(path?: string): Promise<void>;
  onProgress(listener: (payload: TransferProgress) => void): () => void;
  onWatch(listener: (payload: { path: string }) => void): () => void;
  onMenuAction(listener: (actionId: string) => void): () => void;
  onOpenFile(listener: (path: string) => void): () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronBridge;
  }
}

export function hasElectronBridge(): boolean {
  return typeof window !== 'undefined' && Boolean(window.electronAPI);
}

export function createElectronApi(): Api {
  const bridge = window.electronAPI;
  if (!bridge) throw new Error('electronAPI 未注入');

  const lookup = bridge as unknown as Record<string, (r?: unknown) => Promise<unknown>>;
  const api = {} as Record<string, unknown>;
  for (const name of API_NAMES) {
    api[name] = (req?: unknown) => lookup[name](req);
  }
  return api as unknown as Api;
}
