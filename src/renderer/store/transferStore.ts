import { create } from 'zustand';
import type { ConflictAction, ConflictPolicy, TransferProgress, TransferOp } from '@shared/types';
import { api } from '../api';
import { useAppStore } from './appStore';
import { toast } from './toastStore';

interface TransferState {
  /** 进行中的任务，按开始时间倒序 */
  active: TransferProgress[];
  /** 等待用户决策的冲突（一次只处理一个任务） */
  conflict: TransferProgress | null;

  onProgress: (payload: TransferProgress) => void;
  startPaste: (op: TransferOp, sources: string[], destDir: string, conflict: ConflictPolicy) => Promise<void>;
  resolveConflict: (action: ConflictAction, applyToAll: boolean) => Promise<void>;
  cancel: (opId: string) => Promise<void>;
  isBusy: () => boolean;
}

function newOpId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `op-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const useTransferStore = create<TransferState>()((set, get) => ({
  active: [],
  conflict: null,

  onProgress: (payload) => {
    const active = get().active;
    const known = active.some((t) => t.opId === payload.opId);

    // 只处理自己发起过的任务：取消后的迟到事件、别人 opId 的残留都不该弹框
    if (!known) return;

    const others = active.filter((t) => t.opId !== payload.opId);

    if (payload.phase === 'conflict') {
      set({ active: [...others, payload], conflict: payload });
      return;
    }

    if (payload.phase === 'done' || payload.phase === 'error' || payload.phase === 'cancelled') {
      set({ active: others, conflict: get()?.conflict?.opId === payload.opId ? null : get().conflict });

      if (payload.phase === 'done') {
        toast('success', payload.op === 'move' ? '移动完成' : '复制完成');
      } else if (payload.phase === 'cancelled') {
        toast('info', '操作已取消');
      } else {
        toast('error', payload.error?.message ?? '操作失败');
      }
      // 刷新当前目录，让结果立刻可见
      void useAppStore.getState().refresh();
      return;
    }

    set({ active: [...others, payload] });
  },

  startPaste: async (op, sources, destDir, conflict) => {
    const opId = newOpId();
    const placeholder: TransferProgress = {
      opId,
      op,
      phase: 'scan',
      processedFiles: 0,
      totalFiles: 0,
      processedBytes: 0,
      totalBytes: 0,
      currentFile: '正在准备…',
      percent: 0,
      destDir,
      startedAt: Date.now(),
    };

    // 必须先落占位再发请求：小文件传输快到能在 paste 响应回来之前就推完
    // scan → done，若顺序反了，先到的 done 会被当成未知任务丢弃，
    // 后设的 scan 占位就再也没人清理，进度框永久卡住。
    set({ active: [...get().active, placeholder] });

    const result = await api.paste({ opId, op, sources, destDir, conflict });
    if (!result.ok) {
      set({ active: get().active.filter((t) => t.opId !== opId) });
      toast('error', result.error.message);
    }
  },

  resolveConflict: async (action, applyToAll) => {
    const conflict = get().conflict;
    if (!conflict) return;
    set({ conflict: applyToAll ? null : get().conflict });
    await api.resolveConflict({ opId: conflict.opId, action, applyToAll });
  },

  cancel: async (opId) => {
    set({ active: get().active.filter((t) => t.opId !== opId), conflict: null });
    await api.cancelTransfer({ opId });
  },

  isBusy: () => get().active.length > 0,
}));
