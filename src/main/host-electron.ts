import { app, clipboard, shell } from 'electron';
import path from 'node:path';
import type { HostAdapter, SpecialDirKey } from '../core/host';
import { listVolumes, statfsCapacity } from '../core/volumes';
import { getFileIcons } from './icon-service';

const isMac = process.platform === 'darwin';

/**
 * Electron 宿主实现。
 *
 * 所有原生能力（shell.* / app.getFileIcon / clipboard）都被隔离在这里；
 * core/ 只依赖 node:*，不 import electron。
 */
export function createElectronHost(): HostAdapter {
  return {
    nativeOps: true,
    platform: process.platform,
    homePath: app.getPath('home'),
    modLabel: isMac ? '⌘' : 'Ctrl',

    specialDirs(): Record<SpecialDirKey, string> {
      return {
        home: app.getPath('home'),
        desktop: app.getPath('desktop'),
        documents: app.getPath('documents'),
        downloads: app.getPath('downloads'),
        pictures: app.getPath('pictures'),
        music: app.getPath('music'),
        videos: app.getPath('videos'),
        applications: isMac ? '/Applications' : '/usr/share/applications',
      };
    },

    volumes: () => listVolumes(process.platform),

    capacity: (target) => statfsCapacity(target),

    /** 用系统默认程序打开；返回空串表示成功 */
    async open(target: string): Promise<string> {
      const err = await shell.openPath(target);
      return err ?? '';
    },

    /** 在 Finder / 文件资源管理器中显示 */
    async reveal(target: string): Promise<void> {
      shell.showItemInFolder(path.normalize(target));
    },

    /** 移入废纸篓；失败时 reject */
    async trash(target: string): Promise<void> {
      await shell.trashItem(target);
    },

    writeClipboard(text: string): void {
      clipboard.writeText(text);
    },

    async icons(paths: string[]): Promise<Record<string, string | null>> {
      return getFileIcons(paths);
    },
  };
}
