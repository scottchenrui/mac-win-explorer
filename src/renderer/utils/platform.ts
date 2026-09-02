export const isMac = /mac|darwin/i.test(
  typeof navigator !== 'undefined' ? navigator.userAgent : '',
);

/**
 * 跨平台修饰键：macOS 用 meta，其它平台用 ctrl。
 * 参数只取需要的字段，这样 React 合成事件与原生 DOM 事件都能直接传入。
 */
export function isModPressed(e: { metaKey: boolean; ctrlKey: boolean }): boolean {
  return isMac ? e.metaKey : e.ctrlKey;
}

export function modLabel(): string {
  return isMac ? '⌘' : 'Ctrl';
}

/** 是否处于输入态（此时不应触发列表快捷键） */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable === true;
}
