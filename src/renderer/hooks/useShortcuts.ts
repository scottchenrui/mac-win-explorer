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
      const typing =
        target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;

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

      if (mod && key.toLowerCase() === 'c') {
        e.preventDefault();
        handlers.copySelection();
        return;
      }
      if (mod && key.toLowerCase() === 'x') {
        e.preventDefault();
        handlers.cutSelection();
        return;
      }
      if (mod && key.toLowerCase() === 'v') {
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
        const list = app.entries;
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

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handlers, addressRef]);
}
