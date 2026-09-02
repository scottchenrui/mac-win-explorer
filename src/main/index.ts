import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { createContext } from '../core/context';
import { createElectronHost } from './host-electron';
import { registerIpcHandlers } from './ipc/register';
import { createMenu } from './menu';
import { createWindow } from './window';

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

// 开发时（npm run dev）由 dev-desktop.mjs 注入 RENDERER_URL
const isDev = Boolean(process.env.RENDERER_URL);

function bootstrap(): void {
  const ctx = createContext(createElectronHost(), app.getVersion());
  registerIpcHandlers(ctx);

  // 新窗口：渲染层把当前目录传过来，新窗口直接打开同一位置（与 Windows 一致）
  ipcMain.handle('win:new', (_event, initialPath: unknown) => {
    createWindow(typeof initialPath === 'string' && initialPath ? initialPath : undefined);
  });

  const first = createWindow();
  createMenu();

  // 开发时只对第一个窗口挂 DevTools，避免每开一个新窗口都弹一个
  if (isDev) {
    first.webContents.openDevTools({ mode: 'detach' });
  }
}

app.on('second-instance', () => {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.whenReady().then(bootstrap);

app.on('window-all-closed', () => {
  // macOS 上通常 Cmd+Q 才退出；关闭窗口后仍可点击 Dock 重新打开
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// macOS：用户从 Dock 拖拽文件到 app 图标时打开 —— 交给当前焦点窗口
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  if (win) {
    win.webContents.send('open-file', path.resolve(filePath));
  }
});
