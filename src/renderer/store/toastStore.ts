import { create } from 'zustand';

export type ToastKind = 'info' | 'success' | 'error';

export interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
}

interface ToastState {
  toasts: Toast[];
  push: (kind: ToastKind, message: string) => void;
  dismiss: (id: string) => void;
}

const AUTO_DISMISS_MS = 5000;

export const useToastStore = create<ToastState>()((set, get) => ({
  toasts: [],

  push: (kind, message) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    set({ toasts: [...get().toasts, { id, kind, message }] });
    setTimeout(() => get().dismiss(id), kind === 'error' ? AUTO_DISMISS_MS + 3000 : AUTO_DISMISS_MS);
  },

  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

/** 便捷入口：任意位置直接提示，不必先拿 store */
export function toast(kind: ToastKind, message: string): void {
  useToastStore.getState().push(kind, message);
}
