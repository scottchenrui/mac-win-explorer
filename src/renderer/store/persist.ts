/**
 * 轻量本地持久化。
 *
 * 只存"用户偏好"这类丢了也无所谓的东西（列宽、视图模式、排序、是否显示隐藏文件），
 * 不存任何路径或文件内容。localStorage 在隐私模式下会抛异常，所以全部包 try。
 */
const PREFIX = 'explorer.';

export function loadPref<T>(key: string, fallback: T, validate: (v: unknown) => T | null): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw === null) return fallback;
    return validate(JSON.parse(raw)) ?? fallback;
  } catch {
    return fallback;
  }
}

export function savePref(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // 隐私模式或配额已满：偏好存不下不影响功能
  }
}
