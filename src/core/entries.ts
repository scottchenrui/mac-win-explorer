import fs from 'node:fs/promises';
import path from 'node:path';
import type { Dirent } from 'node:fs';
import type { EntryKind, FsEntry } from '../shared/types';
import { typeLabelFor } from '../shared/format';
import { mapLimit } from './utils';

/** macOS 上这些"目录"在系统层面是包，双击应当是打开而非进入内部 */
const PACKAGE_EXTS = new Set([
  '.app',
  '.bundle',
  '.framework',
  '.pkg',
  '.xpc',
  '.plugin',
  '.appex',
  '.photoslibrary',
  '.xcodeproj',
  '.xcworkspace',
  '.playlists',
  '.band',
]);

/** 单次 stat 并发上限：再高会在大目录上把磁盘 IO 打满 */
const STAT_CONCURRENCY = 16;

export function isPackageDir(name: string): boolean {
  return PACKAGE_EXTS.has(path.extname(name).toLowerCase());
}

function kindOf(st: { isDirectory(): boolean; isFile(): boolean }): EntryKind {
  if (st.isDirectory()) return 'dir';
  if (st.isFile()) return 'file';
  return 'other';
}

/** 单个条目的完整信息。目录的 size 恒为 0，目录大小在属性/状态栏里异步计算 */
export async function statEntry(fullPath: string, name?: string): Promise<FsEntry> {
  const base = name ?? path.basename(fullPath);
  const lstat = await fs.lstat(fullPath);

  // 符号链接需要看目标类型才能决定"能不能进去"；断链时退回 lstat
  let target = lstat;
  if (lstat.isSymbolicLink()) {
    try {
      target = await fs.stat(fullPath);
    } catch {
      target = lstat;
    }
  }

  const kind = kindOf(target);
  const ext = path.extname(base).toLowerCase();
  const isPackage = kind === 'dir' && isPackageDir(base);

  return {
    name: base,
    path: fullPath,
    kind,
    isSymlink: lstat.isSymbolicLink(),
    isHidden: base.startsWith('.'),
    isPackage,
    size: kind === 'dir' ? 0 : target.size,
    mtime: Math.floor(target.mtimeMs),
    ctime: Math.floor(target.ctimeMs),
    atime: Math.floor(target.atimeMs),
    birthtime: Math.floor(target.birthtimeMs || target.ctimeMs),
    mode: target.mode & 0o777,
    ext,
    typeLabel: typeLabelFor(base, kind, isPackage, ext),
  };
}

export interface StatBatchResult {
  entries: FsEntry[];
  /** 因权限等问题无法 stat 的条目数 */
  skipped: number;
}

/**
 * 批量 stat。
 *
 * 单个条目失败（常见于 EACCES）只跳过而不让整个目录列出失败 —— 否则
 * 一个无权限文件会让整个目录打不开。
 */
export async function statEntries(parentDir: string, dirents: readonly Dirent[]): Promise<StatBatchResult> {
  const settled = await mapLimit(dirents, STAT_CONCURRENCY, async (d) => {
    const full = path.join(parentDir, d.name);
    try {
      return await statEntry(full, d.name);
    } catch {
      return null;
    }
  });

  const entries: FsEntry[] = [];
  let skipped = 0;
  for (const item of settled) {
    if (item) entries.push(item);
    else skipped += 1;
  }
  return { entries, skipped };
}
