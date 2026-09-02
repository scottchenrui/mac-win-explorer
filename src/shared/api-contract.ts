import type { Result } from './errors';
import type {
  ConflictAction,
  ConflictPolicy,
  FsEntry,
  ListResult,
  PropertiesInfo,
  QuickItem,
  SortSpec,
  TransferOp,
  TransferProgress,
  VolumeInfo,
  GuardVerdict,
} from './types';

/**
 * 全项目唯一的 API 契约。
 *
 * Electron IPC 通道与 Express 预览路由都从这份映射自动生成，
 * 渲染层也只认由它推导出的 `Api` 类型 —— 双通道因此不可能漂移。
 */

export interface ApiRequestMap {
  capabilities: void;
  getRoots: void;
  listDir: { path: string; sort: SortSpec; showHidden: boolean };
  statOne: { path: string };
  getProperties: { path: string };
  checkGuard: { paths: string[] };
  createFolder: { parent: string; name: string };
  createFile: { parent: string; name: string };
  rename: { path: string; newName: string };
  trash: { paths: string[]; permanentFallback: boolean };
  paste: {
    opId: string;
    op: TransferOp;
    sources: string[];
    destDir: string;
    conflict: ConflictPolicy;
  };
  resolveConflict: { opId: string; action: ConflictAction; applyToAll: boolean };
  cancelTransfer: { opId: string };
  copyPathsToClipboard: { paths: string[] };
  openItem: { path: string };
  revealItem: { path: string };
  getIcons: { paths: string[] };
  existsBatch: { paths: string[] };
  watchStart: { path: string };
  watchStop: { path: string };
}

export interface TrashFailure {
  path: string;
  error: { code: string; message: string };
}

export interface ApiResponseMap {
  capabilities: {
    platform: string;
    arch: string;
    /** 原生能力（打开/废纸篓/系统图标/在 Finder 中显示）是否可用 */
    nativeOps: boolean;
    appVersion: string;
    homePath: string;
    /** 修饰键名称，用于快捷键提示文案 */
    modLabel: string;
  };
  getRoots: { quick: QuickItem[]; volumes: VolumeInfo[] };
  listDir: ListResult;
  statOne: FsEntry;
  getProperties: PropertiesInfo;
  checkGuard: { verdicts: Record<string, GuardVerdict> };
  createFolder: FsEntry;
  createFile: FsEntry;
  rename: FsEntry;
  trash: {
    trashed: number;
    failed: TrashFailure[];
    /** 废纸篓不可用时需要用户确认才能永久删除的条目 */
    needsPermanent: string[];
  };
  paste: { opId: string };
  resolveConflict: { accepted: boolean };
  cancelTransfer: { accepted: boolean };
  copyPathsToClipboard: { count: number };
  openItem: { error?: string };
  revealItem: { ok: boolean };
  getIcons: Record<string, string | null>;
  existsBatch: Record<string, boolean>;
  watchStart: { watching: boolean };
  watchStop: { watching: boolean };
}

export type ApiName = keyof ApiRequestMap;

/** 渲染层看到的接口 */
export type Api = {
  [K in ApiName]: ApiRequestMap[K] extends void
    ? () => Promise<Result<ApiResponseMap[K]>>
    : (req: ApiRequestMap[K]) => Promise<Result<ApiResponseMap[K]>>;
};

export interface HandlerDef<Req, Res, Ctx> {
  /** 校验并归一化入参，失败抛 ApiFailure(INVALID_ARG) */
  validate: (raw: unknown) => Req;
  exec: (req: Req, ctx: Ctx) => Promise<Res>;
}

/** 业务层必须实现的方法树；少一个方法编译期就报错 */
export type ApiHandlers<Ctx> = {
  [K in ApiName]: HandlerDef<ApiRequestMap[K], ApiResponseMap[K], Ctx>;
};

export const API_NAMES = [
  'capabilities',
  'getRoots',
  'listDir',
  'statOne',
  'getProperties',
  'checkGuard',
  'createFolder',
  'createFile',
  'rename',
  'trash',
  'paste',
  'resolveConflict',
  'cancelTransfer',
  'copyPathsToClipboard',
  'openItem',
  'revealItem',
  'getIcons',
  'existsBatch',
  'watchStart',
  'watchStop',
] as const;

/** 若有方法忘了写进 API_NAMES，这个类型会暴露缺失的键名 */
export type MissingApiName = Exclude<ApiName, (typeof API_NAMES)[number]>;

/** 流式事件（不走 request/response） */
export type ApiEvent =
  | { type: 'progress'; payload: TransferProgress }
  | { type: 'watch'; payload: { path: string } };

export const IPC_CHANNEL_PREFIX = 'api:';
export const IPC_EVENT_PROGRESS = 'api:progress';
export const IPC_EVENT_WATCH = 'api:watch';
export const IPC_EVENT_MENU = 'menu:action';
