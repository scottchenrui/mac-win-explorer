import { toAppError, type AppError, type ErrCode } from '../shared/errors';

const NODE_CODE_MAP: Partial<Record<string, ErrCode>> = {
  EACCES: 'EACCES',
  EPERM: 'EPERM',
  ENOENT: 'ENOENT',
  EEXIST: 'EEXIST',
  ENOTEMPTY: 'ENOTEMPTY',
  EXDEV: 'EXDEV',
  EISDIR: 'EISDIR',
  EINVAL: 'EINVAL',
  ENOSPC: 'ENOSPC',
  EMLINK: 'EMLINK',
  ELOOP: 'ELOOP',
  ENAMETOOLONG: 'ENAMETOOLONG',
};

const MESSAGES: Record<string, string> = {
  EACCES: '没有权限执行此操作。若访问的是"桌面""文稿""下载"等受保护目录，请到"系统设置 → 隐私与安全性"为本应用授权。',
  EPERM: '操作被系统拒绝，可能没有足够的权限。',
  ENOENT: '找不到该项目，它可能已被移动或删除。',
  EEXIST: '已存在同名项目。',
  ENOTEMPTY: '文件夹不为空。',
  EXDEV: '无法跨磁盘移动该项目，已改为先复制再删除源文件。',
  EISDIR: '该项目是文件夹。',
  EINVAL: '名称无效，请换一个名称。',
  ENOSPC: '磁盘空间不足，无法完成操作。',
  EMLINK: '链接数量已达上限。',
  ELOOP: '存在循环链接，无法完成操作。',
  ENAMETOOLONG: '名称过长。',
  ERR_FS_EISDIR: '该项目是文件夹。',
};

/** Node 系统错误 → 面向用户的 AppError */
export function fromNodeError(e: unknown, path?: string): AppError {
  const raw = e as NodeJS.ErrnoException | null;
  const code = raw?.code ?? '';
  const mapped = NODE_CODE_MAP[code] ?? 'UNKNOWN';
  const base = e instanceof Error ? e : null;
  const detail = base ? `${base.name}: ${base.message}` : String(e);

  const error: AppError = {
    code: mapped,
    message: MESSAGES[code] ?? MESSAGES[mapped] ?? `操作失败：${code || '未知错误'}`,
    detail,
  };
  if (path !== undefined) error.path = path;
  return error;
}

/** core 内部统一入口：ApiFailure 原样透出，其它交给 Node 映射 */
export function normalizeError(e: unknown, path?: string): AppError {
  const appError = toAppError(e);
  if (appError.code !== 'UNKNOWN') return appError;
  return fromNodeError(e, path);
}
