import type { HostAdapter } from './host';
import { ProgressBus } from './progress';
import { TransferManager } from './transfer';
import { DirectoryWatcher } from './watcher';

export class EventBus<T> {
  private readonly listeners = new Set<(payload: T) => void>();

  subscribe(listener: (payload: T) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(payload: T): void {
    for (const listener of this.listeners) listener(payload);
  }
}

export interface CoreContext {
  host: HostAdapter;
  appVersion: string;
  homePath: string;
  /** 传输进度广播 */
  progress: ProgressBus;
  /** 目录变更广播 */
  watchBus: EventBus<string>;
  transfer: TransferManager;
  watcher: DirectoryWatcher;
}

/**
 * 装配业务上下文。
 *
 * transfer 与 watcher 都需要反向引用 ctx，所以先建壳再回填 ——
 * 这是唯一一处刻意的"先空后填"，其余地方都保持不可变。
 */
export function createContext(host: HostAdapter, appVersion: string): CoreContext {
  const ctx = {
    host,
    appVersion,
    homePath: host.homePath,
    progress: new ProgressBus(),
    watchBus: new EventBus<string>(),
  } as CoreContext;

  ctx.transfer = new TransferManager(ctx);
  ctx.watcher = new DirectoryWatcher((dir: string) => ctx.watchBus.emit(dir));
  return ctx;
}
