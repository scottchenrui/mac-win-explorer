import { useEffect, useRef, type JSX } from 'react';
import { useDialogStore } from './store/dialogStore';
import { TitleBar } from './components/TitleBar';
import { CommandBar } from './components/CommandBar';
import { AddressBar } from './components/AddressBar';
import { NavPane } from './components/NavPane';
import { FileList } from './components/FileList';
import { StatusBar } from './components/StatusBar';
import { Dialogs } from './components/Dialogs';
import { TransferUI } from './components/TransferUI';
import { Toasts } from './components/Toasts';
import { useAppStore } from './store/appStore';
import { useTransferStore } from './store/transferStore';
import { useFileActions } from './hooks/useFileActions';
import { useShortcuts } from './hooks/useShortcuts';
import { subscribeMenuAction, subscribeOpenFile, subscribeProgress, subscribeWatch, openNewWindow } from './api/events';
import { api } from './api';

export function App(): JSX.Element {
  const init = useAppStore((s) => s.init);
  const path = useAppStore((s) => s.path);
  const actions = useFileActions();
  const addressRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void init();
  }, [init]);

  // 窗口标题只显示当前目录名（Finder 风格）：macOS 的“窗口”菜单按窗口标题列出各窗口，
  // 多窗口时菜单项名称即目录名称，一眼看出哪个窗口在看哪里。根目录用卷名。
  useEffect(() => {
    const name = path && path !== '/' ? path.slice(path.lastIndexOf('/') + 1) : 'Macintosh HD';
    document.title = path ? name : '文件资源管理器';
  }, [path]);

  // 进度与目录变更事件：Electron 走 IPC、浏览器走 SSE，这里只有一份代码
  useEffect(() => {
    const offProgress = subscribeProgress((payload) => {
      useTransferStore.getState().onProgress(payload);
    });
    const offWatch = subscribeWatch(({ path: changed }) => {
      const current = useAppStore.getState().path;
      // 只刷新当前正在看的目录，避免后台目录改动触发无谓请求
      if (changed === current) void useAppStore.getState().refresh();
    });
    return () => {
      offProgress();
      offWatch();
    };
  }, []);

  // Dock 拖拽文件进来：目录直接进入，文件定位到所在目录并选中
  useEffect(() => {
    const off = subscribeOpenFile((p) => {
      void (async () => {
        const st = await api.statOne({ path: p });
        if (!st.ok) return;
        const store = useAppStore.getState();
        if (st.data.kind === 'dir') {
          await store.navigate(p);
        } else {
          await store.navigate(p.slice(0, p.lastIndexOf('/')) || '/');
          useAppStore.setState({ selection: [p], anchor: p });
        }
      })();
    });
    return off;
  }, []);

  // 监视当前目录，外部改动（比如别的程序新建了文件）会自动刷新
  useEffect(() => {
    if (!path) return;
    void api.watchStart({ path });
    return () => {
      void api.watchStop({ path });
    };
  }, [path]);

  useShortcuts(
    { ...actions, focusAddressBar: () => addressRef.current?.focus() },
    addressRef,
  );

  // 原生菜单动作：macOS 菜单栏 / Dock 拖拽等入口与 UI 按钮共用逻辑
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  useEffect(() => {
    const off = subscribeMenuAction((id) => {
      const app = useAppStore.getState();
      const dialog = useDialogStore.getState();
      const a = actionsRef.current;
      switch (id) {
        case 'cut':
          a.cutSelection();
          return;
        case 'copy':
          a.copySelection();
          return;
        case 'paste':
          void a.pasteHere();
          return;
        case 'selectAll':
          app.selectAll();
          return;
        case 'refresh':
          void app.refresh();
          return;
        case 'up':
          void app.up();
          return;
        case 'back':
          void app.back();
          return;
        case 'forward':
          void app.forward();
          return;
        case 'toggleHidden':
          app.toggleHidden();
          return;
        case 'viewIcons':
        case 'viewList':
        case 'viewDetails':
          app.setView(id.replace('view', '') as 'icons' | 'list' | 'details');
          return;
        case 'newFolder':
          dialog.open({ kind: 'newFolder' });
          return;
        case 'newFile':
          dialog.open({ kind: 'newFile' });
          return;
        case 'newWindow':
          openNewWindow(app.path);
          return;
      }
    });
    return off;
  }, []);

  return (
    <div className="app">
      <TitleBar />
      <CommandBar />
      <AddressBar inputRef={addressRef} />
      <div className="app__body">
        <NavPane />
        <FileList />
      </div>
      <StatusBar />
      <Dialogs />
      <TransferUI />
      <Toasts />
    </div>
  );
}
