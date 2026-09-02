import path from 'node:path';
import { fail } from '../shared/errors';
import type { GuardVerdict, PathGuardLevel } from '../shared/types';

/** 任何写/删/移/重命名都直接拒绝 */
const HARD_BLOCKED = new Set([
  '/',
  '/System',
  '/usr',
  '/bin',
  '/sbin',
  '/etc',
  '/private',
  '/dev',
  '/cores',
  '/Network',
  '/Volumes',
]);

/** 需要显式二次确认 */
const CONFIRM_REQUIRED = new Set([
  '/Applications',
  '/Library',
  '/Users',
  '/opt',
  '/var',
  '/tmp',
]);

export const MAX_PATH_LENGTH = 4096;
export const MAX_NAME_BYTES = 255;
export const MAX_BATCH_PATHS = 5000;

/**
 * 路径规范化。
 *
 * 注意：本项目刻意允许访问整个磁盘，所以"目录穿越"不在威胁模型内。
 * 这里真正要防的是：手输路径绕过校验、误操作系统目录、以及 macOS 上 NFD/NFC
 * 两种 Unicode 归一化形式导致的路径命中不上。
 */
/** 路径中不允许出现的控制字符（NUL..US 与 DEL） */
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

export function normalizePath(input: unknown, label = '路径'): string {
  if (typeof input !== 'string' || input.trim() === '') {
    fail('INVALID_ARG', `${label}不能为空`);
  }
  let raw = input as string;

  // macOS 的 HFS+/APFS 可能给出 NFD 形式，手输的是 NFC，必须统一
  if (raw.includes('\u0000')) fail('INVALID_ARG', `${label}包含非法字符`);
  // eslint-disable-next-line no-control-regex
  if (CONTROL_CHARS.test(raw)) fail('INVALID_ARG', `${label}包含非法控制字符`);
  if (raw.length > MAX_PATH_LENGTH) fail('INVALID_ARG', `${label}过长`);

  raw = raw.trim();
  if (raw.startsWith('~')) {
    fail('INVALID_ARG', `不接受以 ~ 开头的${label}，请传入绝对路径`);
  }

  const resolved = path.resolve(raw);
  return resolved.normalize('NFC');
}

/** 文件名校验（新建/重命名） */
export function normalizeName(input: unknown, label = '名称'): string {
  if (typeof input !== 'string' || input.trim() === '') {
    fail('INVALID_ARG', `${label}不能为空`);
  }
  const name = (input as string).trim();
  if (name === '.' || name === '..') fail('INVALID_ARG', `${label}不能是 . 或 ..`);
  if (name.includes('/') || name.includes('\u0000')) fail('INVALID_ARG', `${label}不能包含 / 或空字符`);
  if (name.startsWith('~')) fail('INVALID_ARG', `${label}不能以 ~ 开头`);
  if (Buffer.byteLength(name, 'utf8') > MAX_NAME_BYTES) fail('INVALID_ARG', `${label}过长`);
  return name.normalize('NFC');
}

/** child 是否在 parent 内部（严格，child === parent 不算） */
export function isInside(child: string, parent: string): boolean {
  const rel = path.relative(parent, child);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/** 是否为用户主目录下的受保护常用目录（桌面/文稿/下载等） */
export function isUserSpecialDir(target: string, home: string): boolean {
  if (!home) return false;
  const specials = ['Desktop', 'Documents', 'Downloads', 'Pictures', 'Movies', 'Music', 'Public', 'Library'];
  return target === home || specials.some((s) => target === path.join(home, s));
}

/** 是否为磁盘卷根目录（/Volumes/xxx） */
export function isVolumeRoot(target: string): boolean {
  return /^\/Volumes\/[^/]+$/.test(target);
}

/**
 * 危险路径分级。
 * blocked：任何写操作直接拒绝；confirm：需要用户二次确认；normal：正常。
 */
export function classifyPath(target: string, home: string): GuardVerdict {
  if (HARD_BLOCKED.has(target)) {
    return { level: 'blocked', reason: '这是受系统保护的位置，不允许修改' };
  }
  if (isVolumeRoot(target)) {
    return { level: 'blocked', reason: '这是磁盘根目录，不允许修改' };
  }
  // /System/xxx、/usr/xxx 等系统目录的子路径同样阻断
  for (const blocked of HARD_BLOCKED) {
    if (blocked !== '/' && (target === blocked || target.startsWith(blocked + '/'))) {
      return { level: 'blocked', reason: '这是受系统保护的位置，不允许修改' };
    }
  }
  if (CONFIRM_REQUIRED.has(target) || isUserSpecialDir(target, home)) {
    return { level: 'confirm', reason: '这是常用目录，操作前会再次确认' };
  }
  return { level: 'normal' };
}

/** 对一批路径做写操作前的统一校验，blocked 直接抛错 */
export function assertWritable(targets: string[], ctxHome: string): PathGuardLevel {
  let worst: PathGuardLevel = 'normal';
  const rank: Record<PathGuardLevel, number> = { normal: 0, confirm: 1, blocked: 2 };
  for (const target of targets) {
    const verdict = classifyPath(target, ctxHome);
    if (verdict.level === 'blocked') {
      fail('BLOCKED_PATH', verdict.reason ?? '该位置不允许修改', target);
    }
    if (rank[verdict.level] > rank[worst]) worst = verdict.level;
  }
  return worst;
}

/** 禁止把目标放进源内部（复制 a/ 到 a/b/ 这种） */
export function assertNotNested(sources: string[], destDir: string): void {
  for (const src of sources) {
    if (src === destDir) {
      fail('SAME_PATH', '源位置与目标位置相同', destDir);
    }
    if (isInside(destDir, src)) {
      fail('NESTED_PATH', '目标位置不能在源位置内部', destDir);
    }
  }
}
