import { create } from 'zustand';
import type { FsEntry } from '@shared/types';

export type DialogState =
  | { kind: 'none' }
  | { kind: 'newFolder' }
  | { kind: 'newFile' }
  // 重命名是行内就地编辑（见 FileList 的 RenameInput），不走对话框
  | { kind: 'delete'; paths: string[] }
  | { kind: 'deletePermanent'; paths: string[]; reason: string }
  | { kind: 'properties'; entry: FsEntry };

interface DialogStore {
  dialog: DialogState;
  open: (dialog: DialogState) => void;
  close: () => void;
}

export const useDialogStore = create<DialogStore>()((set) => ({
  dialog: { kind: 'none' },
  open: (dialog) => set({ dialog }),
  close: () => set({ dialog: { kind: 'none' } }),
}));
