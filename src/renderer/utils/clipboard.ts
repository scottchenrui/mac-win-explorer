/** 原生菜单和浏览器剪贴板事件共用：文本编辑交给 Chromium。 */
export function routeClipboard(
  event: Pick<ClipboardEvent, 'type' | 'preventDefault'>,
  context: { editing: boolean; textSelected: boolean; renaming: boolean; dialogOpen: boolean },
  actions: { copySelection: () => void; cutSelection: () => void; pasteHere: () => Promise<void> },
): void {
  if (context.editing || context.renaming || context.dialogOpen) return;
  if (event.type !== 'paste' && context.textSelected) return;
  event.preventDefault();
  if (event.type === 'copy') actions.copySelection();
  else if (event.type === 'cut') actions.cutSelection();
  else if (event.type === 'paste') void actions.pasteHere();
}

export function isTextEditor(target: Element | null): boolean {
  return Boolean(target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' ||
    (target as HTMLElement).isContentEditable));
}
