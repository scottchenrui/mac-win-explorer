import fs from 'node:fs/promises';
import { ApiFailure, fail } from '../shared/errors';
import { makeComparator } from '../shared/sort';
import type { ListResult, SortSpec } from '../shared/types';
import { fromNodeError } from './errors-node';
import { statEntries } from './entries';
import { normalizePath } from './path-guard';

/** 单目录最多列出的条目数，超出的部分会被截断（配合虚拟滚动） */
export const MAX_LIST_ENTRIES = 20_000;

export async function listDirectory(
  rawPath: string,
  sort: SortSpec,
  showHidden: boolean,
): Promise<ListResult> {
  const dirPath = normalizePath(rawPath, '目录路径');

  let dirents;
  try {
    dirents = await fs.readdir(dirPath, { withFileTypes: true });
  } catch (e) {
    throw new ApiFailure(fromNodeError(e, dirPath));
  }

  const visible = showHidden ? dirents : dirents.filter((d) => !d.name.startsWith('.'));
  const { entries, skipped } = await statEntries(dirPath, visible);
  entries.sort(makeComparator(sort));

  const truncated = entries.length > MAX_LIST_ENTRIES;
  if (truncated) entries.length = MAX_LIST_ENTRIES;

  const result: ListResult = { path: dirPath, entries, truncated };
  if (skipped > 0) {
    result.warning = {
      code: 'EACCES',
      message: `有 ${skipped} 个项目因权限不足无法显示`,
      path: dirPath,
    };
  }
  return result;
}

/**
 * 目录树用：只取子目录，不 stat 文件，避免展开一个大目录时付出全量 stat 代价。
 */
export async function listChildDirs(rawPath: string, showHidden: boolean): Promise<
  Array<{ name: string; path: string; hasChildren: boolean }>
> {
  const dirPath = normalizePath(rawPath, '目录路径');
  let dirents;
  try {
    dirents = await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }

  const out: Array<{ name: string; path: string; hasChildren: boolean }> = [];
  for (const d of dirents) {
    if (!showHidden && d.name.startsWith('.')) continue;
    const isDir = d.isDirectory();
    // 符号链接可能指向目录，单独确认一次
    const treatAsDir = isDir || (d.isSymbolicLink() && (await isDirLink(dirPath, d.name)));
    if (!treatAsDir) continue;
    out.push({
      name: d.name,
      path: `${dirPath === '/' ? '' : dirPath}/${d.name}`,
      // 是否有子节点留给展开时判断，这里先乐观返回 true，展开后自然为空
      hasChildren: true,
    });
  }
  out.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN', { numeric: true }));
  return out;
}

async function isDirLink(parent: string, name: string): Promise<boolean> {
  try {
    const st = await fs.stat(`${parent}/${name}`);
    return st.isDirectory();
  } catch {
    return false;
  }
}

/** 确认目录存在且是目录，否则抛错（导航前校验） */
export async function assertDirectory(rawPath: string): Promise<string> {
  const dirPath = normalizePath(rawPath, '目录路径');
  try {
    const st = await fs.stat(dirPath);
    if (!st.isDirectory()) fail('EINVAL', '该路径不是文件夹', dirPath);
  } catch (e) {
    throw new ApiFailure(fromNodeError(e, dirPath));
  }
  return dirPath;
}
