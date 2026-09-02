import type { AppError } from './errors';

export type EntryKind = 'dir' | 'file' | 'symlink' | 'other';

export interface FsEntry {
  name: string;
  /** 绝对路径（已规范化） */
  path: string;
  kind: EntryKind;
  isSymlink: boolean;
  isHidden: boolean;
  /** macOS：.app / .bundle / .framework / .pkg 等视为单个包，双击打开而非进入 */
  isPackage: boolean;
  /** 目录恒为 0，目录大小在属性/状态栏里异步计算 */
  size: number;
  mtime: number;
  ctime: number;
  atime: number;
  birthtime: number;
  mode: number;
  /** 含点，如 '.txt'；无扩展名为 '' */
  ext: string;
  typeLabel: string;
}

export type SortKey = 'name' | 'mtime' | 'type' | 'size';
export interface SortSpec {
  key: SortKey;
  dir: 'asc' | 'desc';
}

export interface ListResult {
  path: string;
  entries: FsEntry[];
  /** 达到条目上限被截断 */
  truncated: boolean;
  /** 目录本身不可读（如权限不足）时给出提示，但不算失败 */
  warning?: AppError;
}

export type VolumeKind = 'system' | 'external' | 'network' | 'removable' | 'root';
export interface VolumeInfo {
  name: string;
  path: string;
  kind: VolumeKind;
  total: number;
  free: number;
  /** 容量获取失败时为 false，UI 不显示容量条 */
  capacityKnown: boolean;
}

export type QuickIconId =
  | 'home'
  | 'desktop'
  | 'documents'
  | 'downloads'
  | 'pictures'
  | 'music'
  | 'videos'
  | 'applications'
  | 'computer';

export interface QuickItem {
  id: string;
  name: string;
  path: string;
  iconId: QuickIconId;
}

export interface PropertiesPermissions {
  uid: number;
  gid: number;
  modeOctal: string;
  modeString: string;
}

export interface PropertiesInfo {
  entry: FsEntry;
  location: string;
  /** 目录为递归计算后的占用空间；文件为实际大小 */
  sizeOnDisk: number;
  contains: { files: number; dirs: number } | null;
  /** 递归统计是否因超过上限而截断 */
  truncated: boolean;
  permissions: PropertiesPermissions;
}

export type ConflictPolicy = 'replace' | 'skip' | 'keepBoth' | 'ask';
export type ConflictAction = 'replace' | 'skip' | 'keepBoth' | 'retry' | 'cancel';
export type TransferOp = 'copy' | 'move';
export type TransferPhase = 'scan' | 'transfer' | 'conflict' | 'error' | 'done' | 'cancelled';

export interface ConflictItem {
  sourcePath: string;
  destPath: string;
  name: string;
  sourceIsDir: boolean;
  sourceSize: number;
  sourceMtime: number;
  destSize: number;
  destMtime: number;
}

export interface TransferProgress {
  opId: string;
  op: TransferOp;
  phase: TransferPhase;
  processedFiles: number;
  totalFiles: number;
  processedBytes: number;
  totalBytes: number;
  currentFile: string;
  /** 0..1 */
  percent: number;
  destDir: string;
  conflicts?: ConflictItem[];
  error?: AppError;
  startedAt: number;
  bytesPerSecond?: number;
  etaSeconds?: number;
}

/** 危险操作分级，UI 据此决定是否需要二次确认或直接禁用 */
export type PathGuardLevel = 'normal' | 'confirm' | 'blocked';
export interface GuardVerdict {
  level: PathGuardLevel;
  reason?: string;
}
