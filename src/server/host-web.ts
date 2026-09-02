import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { HostAdapter, SpecialDirKey } from '../core/host';
import { listVolumes, statfsCapacity } from '../core/volumes';

/**
 * 浏览器预览通道的 HostAdapter。
 *
 * 这个通道只用于开发与演示：所有原生能力（打开/废纸篓/系统图标/在 Finder 中显示）
 * 都不可用，UI 会依据 capabilities.nativeOps 自动灰显对应按钮。
 *
 * 删除操作不真删，而是移到一个临时回收目录 —— 预览时误删也不至于丢数据。
 */
const PREVIEW_TRASH = path.join(os.tmpdir(), 'explorer-preview-trash');

export function createWebHost(): HostAdapter {
  const home = os.homedir();
  const platform = process.platform;

  const specialDirs = (): Record<SpecialDirKey, string> => ({
    home,
    desktop: path.join(home, 'Desktop'),
    documents: path.join(home, 'Documents'),
    downloads: path.join(home, 'Downloads'),
    pictures: path.join(home, 'Pictures'),
    music: path.join(home, 'Music'),
    videos: path.join(home, 'Movies'),
    applications: platform === 'darwin' ? '/Applications' : '/usr/share/applications',
  });

  return {
    nativeOps: false,
    platform,
    homePath: home,
    modLabel: platform === 'darwin' ? '⌘' : 'Ctrl',

    specialDirs,
    volumes: () => listVolumes(platform),
    capacity: (target) => statfsCapacity(target),

    open: async () => '浏览器预览模式不支持用系统默认程序打开（在桌面版中可用）',
    reveal: async () => {
      throw new Error('浏览器预览模式不支持在 Finder 中显示');
    },
    writeClipboard: () => {
      throw new Error('浏览器预览模式不支持写入系统剪贴板');
    },
    trash: async (target) => {
      await fsp.mkdir(PREVIEW_TRASH, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const dest = path.join(PREVIEW_TRASH, `${stamp}_${path.basename(target)}`);
      await fsp.rename(target, dest);
    },
    icons: async (paths) => Object.fromEntries(paths.map((p) => [p, null])),
  };
}
