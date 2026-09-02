import { BrowserWindow } from 'electron';
import path from 'node:path';

const isDev = Boolean(process.env.RENDERER_URL);

/**
 * 创建一个浏览窗口。
 *
 * initialPath 通过 additionalArguments 传给渲染层（preload 里解析），
 * 新窗口就会直接打开来源窗口所在的目录，而不是回到主目录。
 */
export function createWindow(initialPath?: string): BrowserWindow {
  const win = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 680,
    minHeight: 440,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 12 },
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      additionalArguments: initialPath ? [`--initial-path=${initialPath}`] : [],
    },
  });

  if (isDev) {
    win.loadURL(process.env.RENDERER_URL!);
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  return win;
}
