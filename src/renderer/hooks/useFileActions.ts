import type { FsEntry } from '@shared/types';
import { api } from '../api';
import { useAppStore } from '../store/appStore';
import { useDialogStore } from '../store/dialogStore';
import { useTransferStore } from '../store/transferStore';
import { toast } from '../store/toastStore';

/**
 * 所有文件操作的统一入口。
 *
 * 命令栏按钮、右键菜单、键盘快捷键调用的都是这里 —— 逻辑只写一份，
 * 三处入口的表现必然一致。
 */
export function useFileActions() {
  const app = useAppStore();
  const dialog = useDialogStore();

  const selection = app.selection;

  const submitName = async (name: string): Promise<boolean> => {
    const current = dialog.dialog;

    if (current.kind === 'newFolder' || current.kind === 'newFile') {
      const result =
        current.kind === 'newFolder'
          ? await api.createFolder({ parent: app.path, name })
          : await api.createFile({ parent: app.path, name });
      if (!result.ok) {
        toast('error', result.error.message);
        return false;
      }
      dialog.close();
      await app.refresh();
      // 选中刚创建的项目，方便紧接着重命名
      useAppStore.setState({ selection: [result.data.path], anchor: result.data.path });
      return true;
    }

    return false;
  };

  const copySelection = (): void => copyPaths(selection);

  const cutSelection = (): void => cutPaths(selection);

  /** 复制任意路径（选中项、目录树节点等），同步到跨窗口共享的剪贴板 */
  function copyPaths(paths: string[]): void {
    if (paths.length === 0) return;
    app.setClipboard('copy', paths);
    toast('info', `已复制 ${paths.length} 个项目`);
  }

  /** 剪切任意路径 */
  function cutPaths(paths: string[]): void {
    if (paths.length === 0) return;
    app.setClipboard('move', paths);
    toast('info', `已剪切 ${paths.length} 个项目`);
  }

  const pasteHere = (): Promise<void> => pasteTo(app.path);

  /**
   * 粘贴到任意目标目录（当前目录、目录树节点等）。
   *
   * 剪贴板读自 store 的最新快照（可能来自其它窗口的复制），
   * 因此 A 窗口复制的内容能在 B 窗口粘贴。
   */
  async function pasteTo(destDir: string): Promise<void> {
    const { clipboard, clearClipboard } = useAppStore.getState();
    if (!clipboard) return;

    // 剪切后粘回原位置没有意义
    const sameDir = clipboard.paths.every((p: string) => p.slice(0, p.lastIndexOf('/')) === destDir);
    if (clipboard.mode === 'move' && sameDir) {
      toast('info', '目标位置与源位置相同');
      return;
    }

    await useTransferStore.getState().startPaste(clipboard.mode, clipboard.paths, destDir, 'ask');
    if (clipboard.mode === 'move') clearClipboard();
  }

  const requestDelete = (paths: string[] = selection): void => {
    if (paths.length === 0) return;
    dialog.open({ kind: 'delete', paths });
  };

  const confirmDelete = async (permanentFallback: boolean): Promise<void> => {
    const current = dialog.dialog;
    if (current.kind !== 'delete' && current.kind !== 'deletePermanent') return;
    const paths = current.paths;

    const result = await api.trash({ paths, permanentFallback });
    dialog.close();
    if (!result.ok) {
      toast('error', result.error.message);
      return;
    }

    const { trashed, failed, needsPermanent } = result.data;
    if (needsPermanent.length > 0 && !permanentFallback) {
      // 网络卷等不支持废纸篓的情况：明确告诉用户将要发生什么
      dialog.open({
        kind: 'deletePermanent',
        paths: needsPermanent,
        reason: failed[0]?.error.message ?? '此位置不支持"废纸篓"，删除后将无法恢复。',
      });
      return;
    }

    if (trashed > 0) toast('success', `已将 ${trashed} 个项目移到废纸篓`);
    if (failed.length > 0) {
      toast('error', `${failed.length} 个项目删除失败：${failed[0].error.message}`);
    }
    await app.refresh();
  };

  /** 双击/回车：目录进入，其它交给系统默认程序 */
  const openEntry = async (entry: FsEntry): Promise<void> => {
    if (entry.kind === 'dir' && !entry.isPackage) {
      await app.navigate(entry.path);
      return;
    }
    const result = await api.openItem({ path: entry.path });
    if (!result.ok) {
      toast('error', result.error.message);
      return;
    }
    if (result.data.error) toast('error', result.data.error);
  };

  const revealInSystem = async (path: string): Promise<void> => {
    const result = await api.revealItem({ path });
    if (!result.ok) toast('error', result.error.message);
  };

  const copyPathsToClipboard = async (paths: string[] = selection): Promise<void> => {
    if (paths.length === 0) return;
    const result = await api.copyPathsToClipboard({ paths });
    if (!result.ok) {
      toast('error', result.error.message);
      return;
    }
    toast('success', paths.length === 1 ? '已复制路径' : `已复制 ${paths.length} 条路径`);
  };

  const showProperties = (entry: FsEntry): void => {
    dialog.open({ kind: 'properties', entry });
  };

  /** Windows 是行内就地编辑，不是弹对话框 */
  const startRename = (entry: FsEntry): void => {
    app.startInlineRename(entry.path);
  };

  /**
   * 一键新建文件夹（命令栏“新建”主按钮）。
   *
   * 与 Windows 一致：默认名“新建文件夹”，重名自动加序号；
   * 创建完直接进入行内重命名，用户想改就改、不想改点别处即可。
   */
  const createFolderQuick = async (): Promise<void> => {
    const taken = new Set(app.entries.map((e) => e.name.toLowerCase()));
    let name = '新建文件夹';
    for (let n = 2; taken.has(name.toLowerCase()); n += 1) name = `新建文件夹 ${n}`;

    const result = await api.createFolder({ parent: app.path, name });
    if (!result.ok) {
      toast('error', result.error.message);
      return;
    }
    await app.refresh();
    useAppStore.setState({ selection: [result.data.path], anchor: result.data.path });
    app.startInlineRename(result.data.path);
  };

  return {
    selection,
    submitName,
    copySelection,
    cutSelection,
    copyPaths,
    cutPaths,
    pasteHere,
    pasteTo,
    requestDelete,
    confirmDelete,
    openEntry,
    revealInSystem,
    copyPathsToClipboard,
    showProperties,
    startRename,
    createFolderQuick,
  };
}

export type FileActions = ReturnType<typeof useFileActions>;
