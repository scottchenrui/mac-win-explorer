import { isTextEditor, routeClipboard } from '../utils/clipboard';
import { visibleEntries } from '../store/visibleEntries';
import { useEffect } from 'react';
import { isModPressed } from '../utils/platform';
import type { FileActions } from './useFileActions';
import { useAppStore } from '../store/appStore';
import { useDialogStore } from '../store/dialogStore';
import { openNewWindow } from '../api/events';

export interface ShortcutHandlers extends FileActions {
  focusAddressBar: () => void;
}

/**
 * 全局快捷键。
 *
 * 两个容易踩的坑：
 * 1. 中文输入法组合态（isComposing）时不能拦截按键，否则打不出字；
 * 2. 焦点在输入框里时，除 Esc 外一律不接管。
 */
export function useShortcuts(handlers: ShortcutHandlers, addressRef: React.RefObject<HTMLInputElement | null>): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      // 输入法组合态：直接放行
      if (e.isComposing || e.keyCode === 229) return;

      const target = e.target as HTMLElement | null;
      const typing = isTextEditor(target);

      if (typing) {
        if (e.key === 'Escape') target?.blur();
        return;
      }

      const app = useAppStore.getState();
      const dialog = useDialogStore.getState();
      const mod = isModPressed(e);
      const key = e.key;

      // 有对话框打开时，只保留 Esc
      if (dialog.dialog.kind !== 'none') {
        if (key === 'Escape' && dialog.dialog.kind !== 'deletePermanent') dialog.close();
        return;
      }

      // 双击文件名会产生原生文本选区。此时 Cmd+C/X 的意图是复制/剪切“文字”，
      // 若接管成复制/剪切“文件”，系统剪贴板拿不到文字、内部剪贴板却被塞进文件，
      // 之后一次 Cmd+V 就会把文件粘贴出去并弹出莫名其妙的冲突框。
      const textSelected = (window.getSelection()?.toString() ?? '') !== '';

      if (mod && !e.shiftKey && key.toLowerCase() === 'c') {
        if (textSelected) return; // 交给浏览器复制选中的文字
        e.preventDefault();
        handlers.copySelection();
        return;
      }
      if (mod && !e.shiftKey && key.toLowerCase() === 'x') {
        if (textSelected) return;
        e.preventDefault();
        handlers.cutSelection();
        return;
      }
      if (mod && key.toLowerCase() === 'v') {
        // 行内重命名进行中：Cmd+V 是要往输入框贴文字，不能触发文件粘贴
        if (app.renamingPath !== null) return;
        e.preventDefault();
        void handlers.pasteHere();
        return;
      }
      if (mod && key.toLowerCase() === 'a') {
        e.preventDefault();
        app.selectAll();
        return;
      }
      // ⌘E 新建窗口。桌面版的原生菜单也注册了同一 accelerator：
      // 真实按键时菜单层先拦截（渲染层收不到），这里不会双触发。
      if (mod && !e.shiftKey && key.toLowerCase() === 'e') {
        e.preventDefault();
        openNewWindow(app.path);
        return;
      }
      if (mod && e.shiftKey && key.toLowerCase() === 'n') {
        e.preventDefault();
        dialog.open({ kind: 'newFolder' });
        return;
      }
      if (mod && e.shiftKey && key.toLowerCase() === 'c') {
        e.preventDefault();
        void handlers.copyPathsToClipboard();
        return;
      }
      if (mod && e.shiftKey && key === '.') {
        e.preventDefault();
        app.toggleHidden();
        return;
      }
      if (mod && key.toLowerCase() === 'l') {
        e.preventDefault();
        addressRef.current?.focus();
        addressRef.current?.select();
        return;
      }
      if (mod && (key === 'Backspace' || key === 'Delete')) {
        e.preventDefault();
        handlers.requestDelete();
        return;
      }

      if (key === 'F2') {
        e.preventDefault();
        const first = app.entries.find((entry) => entry.path === app.selection[0]);
        if (first) handlers.startRename(first);
        return;
      }
      if (key === 'Delete') {
        e.preventDefault();
        handlers.requestDelete();
        return;
      }
      if (key === 'F5') {
        e.preventDefault();
        void app.refresh();
        return;
      }
      if (key === 'Escape') {
        app.clearSelection();
        return;
      }
      if (key === 'Enter') {
        const entry = app.entries.find((item) => item.path === app.selection[0]);
        if (entry) {
          e.preventDefault();
          void handlers.openEntry(entry);
        }
        return;
      }

      // 导航：Alt+方向键（Windows 习惯）
      if (e.altKey && key === 'ArrowUp') {
        e.preventDefault();
        void app.up();
        return;
      }
      if (e.altKey && key === 'ArrowLeft') {
        e.preventDefault();
        void app.back();
        return;
      }
      if (e.altKey && key === 'ArrowRight') {
        e.preventDefault();
        void app.forward();
        return;
      }
      if (key === 'Backspace') {
        e.preventDefault();
        void app.up();
        return;
      }

      // 上下键移动选中项（详细信息视图下的键盘导航）
      if (key === 'ArrowDown' || key === 'ArrowUp') {
        e.preventDefault();
        const list = visibleEntries(app);
        if (list.length === 0) return;
        const currentIndex = list.findIndex((item) => item.path === app.selection[0]);
        const nextIndex =
          key === 'ArrowDown'
            ? Math.min(list.length - 1, currentIndex + 1)
            : Math.max(0, currentIndex <= 0 ? 0 : currentIndex - 1);
        app.selectOnly(list[nextIndex].path);
        return;
      }
    };

    // macOS 原生编辑菜单触发 clipboard 事件，不一定触发页面 keydown。
    const onClipboard = (event: ClipboardEvent): void => {
      routeClipboard(event, {
        editing: isTextEditor(document.activeElement) || isTextEditor(event.target instanceof Element ? event.target : null),
        textSelected: (window.getSelection()?.toString() ?? '') !== '',
        renaming: useAppStore.getState().renamingPath !== null,
        dialogOpen: useDialogStore.getState().dialog.kind !== 'none',
      }, handlers);
    };
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('copy', onClipboard);
    document.addEventListener('cut', onClipboard);
    document.addEventListener('paste', onClipboard);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('copy', onClipboard);
      document.removeEventListener('cut', onClipboard);
      document.removeEventListener('paste', onClipboard);
    };
  }, [handlers, addressRef]);
}
