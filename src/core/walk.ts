import fsp from 'node:fs/promises';
import path from 'node:path';
import type { Dirent } from 'node:fs';
import { mapLimit } from './utils';

export interface WalkItem {
  path: string;
  size: number;
  /** 相对本次遍历根的路径，复制/移动时用它拼目标路径；根自身为空串 */
  rel: string;
}

export interface WalkResult {
  files: WalkItem[];
  dirs: WalkItem[];
  totalBytes: number;
  truncated: boolean;
}

export interface WalkOptions {
  maxItems?: number;
  /** 是否跟随符号链接递归（默认否，避免链接环） */
  followSymlinks?: boolean;
}

const DEFAULT_MAX_ITEMS = 200_000;

/**
 * 广度优先遍历。
 *
 * 两个关键点：
 * 1. 用 realpath 集合去重，符号链接环不会导致死循环；
 * 2. 符号链接本身只记一项、不递归进去（与 Finder 复制行为一致）。
 */
export async function walkTree(roots: readonly string[], options: WalkOptions = {}): Promise<WalkResult> {
  const maxItems = options.maxItems ?? DEFAULT_MAX_ITEMS;
  const files: WalkItem[] = [];
  const dirs: WalkItem[] = [];
  const visited = new Set<string>();
  let totalBytes = 0;
  let truncated = false;

  interface Pending {
    abs: string;
    /** 相对根目录的目标名，用于保留结构 */
    rel: string;
  }

  const queue: Pending[] = [];
  for (const root of roots) {
    let st;
    try {
      st = await fsp.lstat(root);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      queue.push({ abs: root, rel: '' });
    } else {
      files.push({ path: root, size: st.size, rel: '' });
      totalBytes += st.size;
    }
  }

  while (queue.length > 0) {
    const current = queue.shift() as Pending;

    let real: string;
    try {
      real = await fsp.realpath(current.abs);
    } catch {
      real = current.abs;
    }
    if (visited.has(real)) continue;
    visited.add(real);

    let children: Dirent[];
    try {
      children = await fsp.readdir(current.abs, { withFileTypes: true });
    } catch {
      // 无权限的子目录：记录目录本身后跳过，不中断整体遍历
      dirs.push({ path: current.abs, size: 0, rel: current.rel });
      continue;
    }

    if (files.length + dirs.length >= maxItems) {
      truncated = true;
      break;
    }

    dirs.push({ path: current.abs, size: 0, rel: current.rel });

    for (const child of children) {
      const childAbs = path.join(current.abs, child.name);
      if (child.isDirectory()) {
        queue.push({ abs: childAbs, rel: path.join(current.rel, child.name) });
      } else if (child.isFile()) {
        let size = 0;
        try {
          const st = await fsp.stat(childAbs);
          size = st.size;
        } catch {
          size = 0;
        }
        files.push({ path: childAbs, size, rel: path.join(current.rel, child.name) });
        totalBytes += size;
      } else if (child.isSymbolicLink()) {
        // 链接本身只作为一项，不跟随
        files.push({ path: childAbs, size: 0, rel: path.join(current.rel, child.name) });
      }
    }
  }

  return { files, dirs, totalBytes, truncated };
}

/** 只统计数量与字节数，不保留列表 —— 属性对话框与状态栏用 */
export async function countTree(
  root: string,
  maxItems = 50_000,
): Promise<{ files: number; dirs: number; bytes: number; truncated: boolean }> {
  let files = 0;
  let dirs = 0;
  let bytes = 0;
  let truncated = false;
  const visited = new Set<string>();
  const queue: string[] = [root];

  while (queue.length > 0) {
    const current = queue.shift() as string;
    let real: string;
    try {
      real = await fsp.realpath(current);
    } catch {
      real = current;
    }
    if (visited.has(real)) continue;
    visited.add(real);

    let children: Dirent[];
    try {
      children = await fsp.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    dirs += 1;

    if (files + dirs >= maxItems) {
      truncated = true;
      break;
    }

    for (const child of children) {
      if (child.isDirectory()) {
        queue.push(path.join(current, child.name));
      } else if (child.isFile()) {
        files += 1;
        try {
          const st = await fsp.stat(path.join(current, child.name));
          bytes += st.size;
        } catch {
          // 忽略
        }
      } else {
        files += 1;
      }
    }
  }

  return { files, dirs, bytes, truncated };
}

/** 批量判断路径是否存在（reveal 前预检用） */
export async function existsBatch(paths: readonly string[]): Promise<Record<string, boolean>> {
  const result: Record<string, boolean> = {};
  await mapLimit(paths, 16, async (target) => {
    let exists = false;
    try {
      await fsp.lstat(target);
      exists = true;
    } catch {
      exists = false;
    }
    result[target] = exists;
  });
  return result;
}
