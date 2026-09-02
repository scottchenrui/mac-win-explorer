import fsp from 'node:fs/promises';
import path from 'node:path';
import { ApiFailure, fail } from '../shared/errors';
import type { FsEntry } from '../shared/types';
import type { CoreContext } from './context';
import { fromNodeError } from './errors-node';
import { statEntry } from './entries';
import { assertWritable, normalizeName, normalizePath } from './path-guard';
import { pathExists } from './conflicts';

function toFailure(e: unknown, target?: string): ApiFailure {
  return new ApiFailure(fromNodeError(e, target));
}

export async function createFolder(
  ctx: CoreContext,
  rawParent: string,
  rawName: string,
): Promise<FsEntry> {
  const parent = normalizePath(rawParent, '目标位置');
  const name = normalizeName(rawName, '文件夹名称');
  assertWritable([parent], ctx.homePath);

  const target = path.join(parent, name);
  if (await pathExists(target)) {
    fail('EEXIST', '此位置已存在同名项目，请换一个名称', target);
  }
  try {
    await fsp.mkdir(target);
  } catch (e) {
    throw toFailure(e, target);
  }
  return statEntry(target, name);
}

export async function createFile(
  ctx: CoreContext,
  rawParent: string,
  rawName: string,
): Promise<FsEntry> {
  const parent = normalizePath(rawParent, '目标位置');
  const name = normalizeName(rawName, '文件名称');
  assertWritable([parent], ctx.homePath);

  const target = path.join(parent, name);
  if (await pathExists(target)) {
    fail('EEXIST', '此位置已存在同名项目，请换一个名称', target);
  }
  try {
    // wx：存在则失败，避免竞态覆盖
    const handle = await fsp.open(target, 'wx');
    await handle.close();
  } catch (e) {
    throw toFailure(e, target);
  }
  return statEntry(target, name);
}

export async function renameEntry(
  ctx: CoreContext,
  rawPath: string,
  rawNewName: string,
): Promise<FsEntry> {
  const source = normalizePath(rawPath, '路径');
  const newName = normalizeName(rawNewName, '新名称');
  const parent = path.dirname(source);
  const oldName = path.basename(source);
  if (oldName === newName) return statEntry(source, oldName);

  assertWritable([parent, source], ctx.homePath);
  const target = path.join(parent, newName);

  // APFS 默认大小写不敏感：仅大小写变化时 rename 是允许的，
  // 但名字完全相同（不敏感意义上）会落到自身，这里直接放行。
  if (oldName.toLowerCase() !== newName.toLowerCase() && (await pathExists(target))) {
    fail('EEXIST', '此位置已存在同名项目，请换一个名称', target);
  }

  try {
    await fsp.rename(source, target);
  } catch (e) {
    throw toFailure(e, target);
  }
  return statEntry(target, newName);
}

export interface TrashSummary {
  trashed: number;
  failed: Array<{ path: string; error: { code: string; message: string } }>;
  /** 废纸篓不可用、需要用户确认才能永久删除的条目 */
  needsPermanent: string[];
}

/**
 * 移入废纸篓。
 *
 * 逐项执行、收集失败，而不是一个失败就整体中断 —— 删 50 个文件时
 * 第 3 个被占用，不应该让剩下 47 个都删不掉。
 */
export async function trashPaths(
  ctx: CoreContext,
  rawPaths: string[],
  permanentFallback: boolean,
): Promise<TrashSummary> {
  const targets = rawPaths.map((p) => normalizePath(p, '路径'));
  if (targets.length === 0) fail('INVALID_ARG', '请先选择要删除的项目');
  assertWritable(targets, ctx.homePath);

  const summary: TrashSummary = { trashed: 0, failed: [], needsPermanent: [] };

  for (const target of targets) {
    try {
      await ctx.host.trash(target);
      summary.trashed += 1;
    } catch (e) {
      const appError = fromNodeError(e, target);
      if (permanentFallback) {
        // 用户已明确同意：仅在废纸篓不可用时才永久删除
        try {
          await fsp.rm(target, { recursive: true, force: true });
          summary.trashed += 1;
          continue;
        } catch (rmError) {
          const rmAppError = fromNodeError(rmError, target);
          summary.failed.push({ path: target, error: { code: rmAppError.code, message: rmAppError.message } });
          continue;
        }
      }
      summary.failed.push({ path: target, error: { code: appError.code, message: appError.message } });
      summary.needsPermanent.push(target);
    }
  }
  return summary;
}

export { pathExists } from './conflicts';
