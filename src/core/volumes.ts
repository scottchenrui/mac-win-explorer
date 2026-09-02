import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { VolumeInfo, VolumeKind } from '../shared/types';

/** statfs 拿磁盘容量；不支持时返回 null（网络卷常见） */
export function statfsCapacity(target: string): { total: number; free: number } | null {
  try {
    const st = fs.statfsSync(target);
    return {
      total: Number(st.blocks) * Number(st.bsize),
      free: Number(st.bavail) * Number(st.bsize),
    };
  } catch {
    return null;
  }
}

function makeVolume(name: string, mountPath: string, kind: VolumeKind): VolumeInfo {
  const cap = statfsCapacity(mountPath);
  return {
    name,
    path: mountPath,
    kind: cap ? kind : 'network',
    total: cap?.total ?? 0,
    free: cap?.free ?? 0,
    capacityKnown: cap !== null,
  };
}

/**
 * 枚举磁盘卷。
 *
 * macOS 上 /Volumes 里的 "Macintosh HD" 通常是指向 / 的符号链接，
 * 必须用 realpath 去重，否则启动盘会出现两次。
 */
export async function listVolumes(platform: string): Promise<VolumeInfo[]> {
  if (platform === 'darwin') return listMacVolumes();
  return listPosixVolumes();
}

async function listMacVolumes(): Promise<VolumeInfo[]> {
  const out: VolumeInfo[] = [];
  const handledReal = new Set<string>();

  let rootReal = '/';
  try {
    rootReal = await fsp.realpath('/');
  } catch {
    /* 保持 '/' */
  }
  handledReal.add(rootReal);

  let dirents: import('node:fs').Dirent[];
  try {
    dirents = await fsp.readdir('/Volumes', { withFileTypes: true });
  } catch {
    // 没有 /Volumes（极罕见）：仍然给出启动盘
    out.push(makeVolume('Macintosh HD', '/', 'system'));
    return out;
  }

  // 启动盘在 /Volumes 里通常有个指向 / 的同名符号链接（如 "Macintosh HD"）。
  // 用它的名字而不是硬编码 —— 用户可能改过磁盘名。
  let bootName = 'Macintosh HD';
  for (const d of dirents) {
    if (d.name.startsWith('.')) continue;
    try {
      if ((await fsp.realpath(path.join('/Volumes', d.name))) === rootReal) {
        bootName = d.name;
        break;
      }
    } catch {
      /* 忽略无法解析的条目 */
    }
  }
  out.push(makeVolume(bootName, '/', 'system'));

  for (const d of dirents) {
    if (d.name.startsWith('.')) continue;
    const mountPath = path.join('/Volumes', d.name);
    try {
      const real = await fsp.realpath(mountPath);
      if (handledReal.has(real)) continue;
      const st = await fsp.stat(real);
      if (!st.isDirectory()) continue;
      handledReal.add(real);
      out.push(makeVolume(d.name, mountPath, 'external'));
    } catch {
      // 卷被拔出或无权限：静默跳过，不让它把整个列表搞崩
    }
  }
  return out;
}

/** Linux 等非 macOS 平台的回退实现，保证浏览器预览通道可用 */
async function listPosixVolumes(): Promise<VolumeInfo[]> {
  const out: VolumeInfo[] = [makeVolume('文件系统', '/', 'root')];

  for (const parent of ['/mnt', '/media']) {
    let dirents: import('node:fs').Dirent[];
    try {
      dirents = await fsp.readdir(parent, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const d of dirents) {
      if (!d.isDirectory() && !d.isSymbolicLink()) continue;
      const mountPath = path.join(parent, d.name);
      try {
        const st = await fsp.stat(mountPath);
        if (st.isDirectory()) out.push(makeVolume(d.name, mountPath, 'removable'));
      } catch {
        // 忽略
      }
    }
  }
  return out;
}
