import fsp from 'node:fs/promises';
import type { PropertiesInfo } from '../shared/types';
import { statEntry } from './entries';
import { normalizePath } from './path-guard';
import { formatModeOctal, formatModeString } from '../shared/format';
import { countTree } from './walk';

/** 递归统计上限，防止在超大目录上卡死 */
const MAX_COUNT_ITEMS = 50_000;

export async function getProperties(rawPath: string): Promise<PropertiesInfo> {
  const target = normalizePath(rawPath, '路径');
  const entry = await statEntry(target);
  const location = target.slice(0, Math.max(0, target.lastIndexOf('/'))) || '/';

  let sizeOnDisk = 0;
  let contains: { files: number; dirs: number } | null = null;
  let truncated = false;

  if (entry.kind === 'dir' && !entry.isPackage) {
    const counted = await countTree(target, MAX_COUNT_ITEMS);
    contains = { files: counted.files, dirs: counted.dirs };
    sizeOnDisk = counted.bytes;
    truncated = counted.truncated;
  } else {
    // 文件：用实际占用块数，比逻辑大小更接近"占用空间"
    try {
      const st = await fsp.stat(target);
      sizeOnDisk = st.blocks > 0 ? st.blocks * 512 : st.size;
    } catch {
      sizeOnDisk = entry.size;
    }
  }

  let uid = 0;
  let gid = 0;
  try {
    const st = await fsp.stat(target);
    uid = st.uid;
    gid = st.gid;
  } catch {
    // 拿不到就显示 0
  }

  return {
    entry,
    location,
    sizeOnDisk,
    contains,
    truncated,
    permissions: {
      uid,
      gid,
      modeOctal: formatModeOctal(entry.mode),
      modeString: formatModeString(entry.mode),
    },
  };
}

/** 状态栏用：批量算目录大小（数量受限，避免选中一堆大目录时卡界面） */
export async function sumSizes(paths: string[]): Promise<number> {
  let total = 0;
  for (const target of paths.slice(0, 32)) {
    try {
      const st = await fsp.stat(target);
      if (st.isDirectory()) {
        const counted = await countTree(target, MAX_COUNT_ITEMS);
        total += counted.bytes;
      } else {
        total += st.size;
      }
    } catch {
      // 单个失败不影响总数
    }
  }
  return total;
}
