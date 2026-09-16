import fs from 'node:fs';
import type { FSWatcher } from 'node:fs';

const DEBOUNCE_MS = 300;

/**
 * 目录变更监视。
 *
 * 去抖 300ms：一次粘贴几百个文件会触发几百次事件，直接刷新会把界面刷死。
 * 平台不支持 fs.watch 时静默降级（不影响功能，只是不自动刷新）。
 */
export class DirectoryWatcher {
  private readonly watchers = new Map<string, { watcher: FSWatcher; timer: NodeJS.Timeout | null; owners: Set<string> }>();

  constructor(private readonly onChange: (dir: string) => void) {}

  watch(dir: string, owner = 'default'): boolean {
    const existing = this.watchers.get(dir);
    if (existing) {
      existing.owners.add(owner);
      return true;
    }
    try {
      const watcher = fs.watch(dir, { persistent: false }, () => {
        const entry = this.watchers.get(dir);
        if (!entry) return;
        if (entry.timer) clearTimeout(entry.timer);
        entry.timer = setTimeout(() => {
          entry.timer = null;
          this.onChange(dir);
        }, DEBOUNCE_MS);
      });
      this.watchers.set(dir, { watcher, timer: null, owners: new Set([owner]) });
      watcher.on('error', () => this.close(dir));
      return true;
    } catch {
      return false;
    }
  }

  unwatch(dir: string, owner = 'default'): boolean {
    const entry = this.watchers.get(dir);
    if (!entry) return false;
    entry.owners.delete(owner);
    if (entry.owners.size === 0) this.close(dir);
    return true;
  }

  releaseOwner(owner: string): void {
    for (const dir of this.watchers.keys()) this.unwatch(dir, owner);
  }

  private close(dir: string): boolean {
    const entry = this.watchers.get(dir);
    if (!entry) return false;
    if (entry.timer) clearTimeout(entry.timer);
    try {
      entry.watcher.close();
    } catch {
      // 已经关掉了
    }
    this.watchers.delete(dir);
    return true;
  }

  /** 只保留给定目录，其余全部取消（切换目录时调用，避免监视器无限增长） */
  retainOnly(dirs: readonly string[]): void {
    const keep = new Set(dirs);
    for (const dir of [...this.watchers.keys()]) {
      if (!keep.has(dir)) this.close(dir);
    }
  }

  stopAll(): void {
    for (const dir of [...this.watchers.keys()]) this.close(dir);
  }
}
