import { useEffect, useState } from 'react';
import type { FsEntry } from '@shared/types';
import { api } from '../api';
import { useAppStore } from '../store/appStore';

/**
 * 系统文件图标缓存。
 *
 * 只在原生能力可用时才去取（预览模式下 app.getFileIcon 本来就返回 null），
 * 结果按路径缓存，滚动时不会重复请求。
 */
const iconCache = new Map<string, string | null>();
let requested = new Set<string>();

export function useEntryIcons(entries: FsEntry[]): Map<string, string | null> {
  const nativeOps = useAppStore((s) => s.nativeOps);
  const [, bump] = useState(0);

  useEffect(() => {
    if (!nativeOps) return;

    const missing = entries
      .map((e) => e.path)
      .filter((p) => !iconCache.has(p) && !requested.has(p))
      .slice(0, 300);

    if (missing.length === 0) return;
    for (const p of missing) requested.add(p);

    let cancelled = false;
    void (async () => {
      const result = await api.getIcons({ paths: missing });
      if (cancelled) return;
      if (result.ok) {
        for (const [path, url] of Object.entries(result.data)) iconCache.set(path, url);
      }
      bump((v) => v + 1);
    })();

    return () => {
      cancelled = true;
    };
  }, [entries, nativeOps]);

  return iconCache;
}

/** 目录切换后清空缓存，避免长时间运行后无限增长 */
export function clearIconCache(): void {
  iconCache.clear();
  requested = new Set();
}
