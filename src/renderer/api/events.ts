import { useAppStore } from '../store/appStore';
import { watchSession } from './session';
import type { ClipboardPayload, TransferProgress } from '@shared/types';
import { api, isElectron } from './index';

type Unsubscribe = () => void;

/**
 * 进度事件订阅：Electron 走 IPC，浏览器走 SSE。渲染层代码只有这一份。
 */
export function subscribeProgress(listener: (payload: TransferProgress) => void): Unsubscribe {
  if (isElectron) {
    return window.electronAPI?.onProgress(listener) ?? (() => {});
  }
  const source = new EventSource('/api/events');
  const handler = (event: MessageEvent<string>): void => {
    listener(JSON.parse(event.data) as TransferProgress);
  };
  source.addEventListener('progress', handler as EventListener);
  return () => {
    source.removeEventListener('progress', handler as EventListener);
    source.close();
  };
}

/** 目录变更通知 */
export function subscribeWatch(listener: (payload: { path: string }) => void): Unsubscribe {
  if (isElectron) {
    return window.electronAPI?.onWatch(listener) ?? (() => {});
  }
  const source = new EventSource(`/api/events?watchSession=${watchSession}`);
  source.onopen = () => {
    const path = useAppStore.getState().path;
    if (path) void api.watchStart({ path });
  };
  const handler = (event: MessageEvent<string>): void => {
    listener(JSON.parse(event.data) as { path: string });
  };
  source.addEventListener('watch', handler as EventListener);
  return () => {
    source.removeEventListener('watch', handler as EventListener);
    source.close();
  };
}

/**
 * 剪贴板变更通知（跨窗口共享）。
 *
 * Electron 走 IPC、浏览器走 SSE；任一窗口复制/剪切后，
 * 所有窗口都会收到最新的剪贴板内容（清空时为 null）。
 */
export function subscribeClipboard(
  listener: (payload: ClipboardPayload | null) => void,
): Unsubscribe {
  if (isElectron) {
    return window.electronAPI?.onClipboard(listener) ?? (() => {});
  }
  const source = new EventSource('/api/events');
  const handler = (event: MessageEvent<string>): void => {
    listener(JSON.parse(event.data) as ClipboardPayload | null);
  };
  source.addEventListener('clipboard', handler as EventListener);
  return () => {
    source.removeEventListener('clipboard', handler as EventListener);
    source.close();
  };
}

/** 原生菜单动作（新建文件夹/全选/刷新等） */
export function subscribeMenuAction(listener: (actionId: string) => void): Unsubscribe {
  if (!isElectron) return () => {};
  return window.electronAPI?.onMenuAction(listener) ?? (() => {});
}

/** Dock 拖拽文件进来：定位到该文件/目录 */
export function subscribeOpenFile(listener: (path: string) => void): Unsubscribe {
  if (!isElectron) return () => {};
  return window.electronAPI?.onOpenFile(listener) ?? (() => {});
}

/**
 * 新建浏览窗口。
 *
 * 桌面版走 IPC 让主进程再开一个 BrowserWindow；
 * 浏览器预览版没有“窗口”概念，退化为新标签页。
 */
export function openNewWindow(path?: string): void {
  if (isElectron) {
    void window.electronAPI?.newWindow(path);
    return;
  }
  window.open(window.location.pathname, '_blank');
}
