/**
 * 错误码与 Result 包装。
 *
 * 全项目统一用 Result<T> 而不是抛异常跨通道传播，原因有两个：
 * 1. Electron IPC 的 invoke reject 后，Error 上的自定义字段（如 code）会丢失；
 * 2. HTTP 通道需要一套与 IPC 完全一致的错误语义，Result 让两条通道天然对齐。
 */

export type ErrCode =
  // 来自 Node 的系统错误
  | 'EACCES'
  | 'ENOENT'
  | 'EEXIST'
  | 'ENOTEMPTY'
  | 'EXDEV'
  | 'EPERM'
  | 'EISDIR'
  | 'EINVAL'
  | 'ENOSPC'
  | 'EMLINK'
  | 'ELOOP'
  | 'ENAMETOOLONG'
  // 业务错误
  | 'BLOCKED_PATH'
  | 'INVALID_ARG'
  | 'CANCELLED'
  | 'CONFLICT'
  | 'SAME_PATH'
  | 'NESTED_PATH'
  | 'NAME_TAKEN'
  | 'UNSUPPORTED'
  | 'UNKNOWN';

export interface AppError {
  code: ErrCode;
  /** 面向用户的中文提示 */
  message: string;
  path?: string;
  /** 原始错误细节，供排查使用，不直接展示 */
  detail?: string;
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: AppError };

/** core 层内部抛出，由通道适配器统一转成 Result */
export class ApiFailure extends Error {
  readonly appError: AppError;
  constructor(appError: AppError) {
    super(appError.message);
    this.name = 'ApiFailure';
    this.appError = appError;
  }
}

export function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

export function errResult<T = never>(
  code: ErrCode,
  message: string,
  path?: string,
  detail?: string,
): Result<T> {
  const error: AppError = { code, message };
  if (path !== undefined) error.path = path;
  if (detail !== undefined) error.detail = detail;
  return { ok: false, error };
}

/** core 层主动失败 */
export function fail(code: ErrCode, message: string, path?: string, detail?: string): never {
  const error: AppError = { code, message };
  if (path !== undefined) error.path = path;
  if (detail !== undefined) error.detail = detail;
  throw new ApiFailure(error);
}

export function isAppError(e: unknown): e is AppError {
  return (
    typeof e === 'object' &&
    e !== null &&
    typeof (e as { code?: unknown }).code === 'string' &&
    typeof (e as { message?: unknown }).message === 'string'
  );
}

/** 把任意异常归一成 AppError（Node 系统错误的映射在 core/errors-node.ts 里做更细的处理） */
export function toAppError(e: unknown): AppError {
  if (e instanceof ApiFailure) return e.appError;
  if (isAppError(e)) return e;
  if (e instanceof Error) {
    return { code: 'UNKNOWN', message: e.message || '发生未知错误', detail: e.message };
  }
  return { code: 'UNKNOWN', message: '发生未知错误', detail: String(e) };
}
