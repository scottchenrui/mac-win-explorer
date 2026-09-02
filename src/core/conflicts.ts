import fsp from 'node:fs/promises';
import path from 'node:path';
import type { ConflictItem } from '../shared/types';

/** 目标目录现有名字集合（小写）。APFS 默认大小写不敏感，必须按小写比较 */
export async function existingNames(dir: string): Promise<Set<string>> {
  const taken = new Set<string>();
  try {
    const dirents = await fsp.readdir(dir, { withFileTypes: true });
    for (const d of dirents) taken.add(d.name.toLowerCase());
  } catch {
    // 目录不可读：当作空目录，后续操作自然会报具体错误
  }
  return taken;
}

function splitExt(name: string): [string, string] {
  const dot = name.lastIndexOf('.');
  if (dot > 0) return [name.slice(0, dot), name.slice(dot)];
  return [name, ''];
}

/**
 * 生成一个不冲突的名字：报告.txt → 报告 (2).txt → 报告 (3).txt
 *
 * 与 uniqueDestPath 用同一套规则 —— 顶层冲突和目录内部冲突若命名风格不同
 * （一个"报告 副本.txt"、一个"报告 (2).txt"），用户会觉得软件精神分裂。
 */
export function uniqueTargetName(desired: string, taken: Set<string>): string {
  if (!taken.has(desired.toLowerCase())) return desired;
  const [base, ext] = splitExt(desired);

  for (let i = 2; i < 10_000; i += 1) {
    const candidate = `${base} (${i})${ext}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `${base} (${Date.now()})${ext}`;
}

/** 已存在时递增后缀：文件.txt → 文件 (2).txt（用于目录内部的同名冲突） */
export async function uniqueDestPath(dest: string): Promise<string> {
  let candidate = dest;
  if (!(await pathExists(candidate))) return candidate;

  const dir = path.dirname(dest);
  const [base, ext] = splitExt(path.basename(dest));
  for (let i = 2; i < 10_000; i += 1) {
    candidate = path.join(dir, `${base} (${i})${ext}`);
    if (!(await pathExists(candidate))) return candidate;
  }
  return path.join(dir, `${base} (${Date.now()})${ext}`);
}

export async function pathExists(target: string): Promise<boolean> {
  try {
    await fsp.lstat(target);
    return true;
  } catch {
    return false;
  }
}

/**
 * 检测顶层冲突（源名在目标目录已存在）。
 *
 * 目录内部的同名冲突在传输过程中按策略处理，不在这里逐个检查 ——
 * 否则复制一个含 5 万文件的目录会先做 5 万次 stat。
 */
export async function detectTopLevelConflicts(
  sources: readonly string[],
  destDir: string,
): Promise<ConflictItem[]> {
  const taken = await existingNames(destDir);
  const conflicts: ConflictItem[] = [];

  for (const source of sources) {
    const name = path.basename(source);
    if (!taken.has(name.toLowerCase())) continue;

    const destPath = path.join(destDir, name);
    let sourceSize = 0;
    let sourceMtime = 0;
    let sourceIsDir = false;
    let destSize = 0;
    let destMtime = 0;

    try {
      const st = await fsp.stat(source);
      sourceSize = st.isDirectory() ? 0 : st.size;
      sourceMtime = Math.floor(st.mtimeMs);
      sourceIsDir = st.isDirectory();
    } catch {
      // 源读不到就当作 0，冲突对话框仍能显示
    }
    try {
      const st = await fsp.stat(destPath);
      destSize = st.isDirectory() ? 0 : st.size;
      destMtime = Math.floor(st.mtimeMs);
    } catch {
      // 忽略
    }

    conflicts.push({
      sourcePath: source,
      destPath,
      name,
      sourceIsDir,
      sourceSize,
      sourceMtime,
      destSize,
      destMtime,
    });
  }
  return conflicts;
}
