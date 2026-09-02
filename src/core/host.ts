import type { VolumeInfo } from '../shared/types';

export type SpecialDirKey =
  | 'home'
  | 'desktop'
  | 'documents'
  | 'downloads'
  | 'pictures'
  | 'music'
  | 'videos'
  | 'applications';

/**
 * 平台差异全部收敛到这里。
 *
 * Electron 与 Web 预览两条通道各实现一份：
 * Electron 版本走 shell.* / app.getFileIcon；Web 版本对不支持的能力返回 UNSUPPORTED，
 * UI 依据 capabilities.nativeOps 灰显按钮，而不是写死平台判断。
 */
export interface HostAdapter {
  /** 原生能力（打开/废纸篓/系统图标/在系统文件管理器中显示）是否可用 */
  readonly nativeOps: boolean;
  readonly platform: string;
  readonly homePath: string;
  /** 修饰键名称，用于快捷键提示文案：macOS 是 ⌘，其它平台是 Ctrl */
  readonly modLabel: string;

  specialDirs(): Record<SpecialDirKey, string>;
  volumes(): Promise<VolumeInfo[]>;
  /** 磁盘容量；不支持时返回 null */
  capacity(path: string): { total: number; free: number } | null;

  /** 用系统默认程序打开。返回空串表示成功，非空为错误描述 */
  open(path: string): Promise<string>;
  /** 在系统文件管理器中显示（macOS 为 Finder） */
  reveal(path: string): Promise<void>;
  /** 移入废纸篓。失败时 reject，由上层决定回退策略 */
  trash(path: string): Promise<void>;
  writeClipboard(text: string): void;
  /** 系统文件图标 → dataURL；不支持时返回 null */
  icons(paths: string[]): Promise<Record<string, string | null>>;
}
