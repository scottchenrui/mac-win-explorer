import { Menu } from 'electron';
import { sendMenuAction } from './ipc/register';

/**
 * macOS 原生菜单栏。
 *
 * 快捷键在这里注册一次，窗口获得焦点时就会响应；
 * 具体动作通过 menu:action 通道发给焦点窗口的渲染层，与 UI 按钮共用同一套逻辑。
 */
export function createMenu(): void {
  const send = (id: string) => sendMenuAction(id);

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      role: 'appMenu',
      label: 'Explorer',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        {
          label: '新建窗口',
          accelerator: 'CmdOrCtrl+E',
          click: () => send('newWindow'),
        },
        { type: 'separator' },
        { role: 'quit', label: '退出 Explorer' },
      ],
    },
    {
      role: 'editMenu',
      label: '编辑',
      submenu: [
        { role: 'cut', label: '剪切', accelerator: 'CmdOrCtrl+X' },
        { role: 'copy', label: '复制', accelerator: 'CmdOrCtrl+C' },
        { role: 'paste', label: '粘贴', accelerator: 'CmdOrCtrl+V' },
        { type: 'separator' },
        { role: 'selectAll', label: '全选', accelerator: 'CmdOrCtrl+A' },
      ],
    },
    {
      label: '查看',
      submenu: [
        {
          label: '切换隐藏文件',
          accelerator: 'CmdOrCtrl+Shift+.',
          click: () => send('toggleHidden'),
        },
        { type: 'separator' },
        {
          label: '大图标',
          click: () => send('viewIcons'),
        },
        {
          label: '列表',
          click: () => send('viewList'),
        },
        {
          label: '详细信息',
          click: () => send('viewDetails'),
        },
        { type: 'separator' },
        {
          label: '刷新',
          accelerator: 'F5',
          click: () => send('refresh'),
        },
      ],
    },
    {
      label: '前往',
      submenu: [
        {
          label: '上一级',
          accelerator: 'Alt+Up',
          click: () => send('up'),
        },
        {
          label: '后退',
          accelerator: 'Alt+Left',
          click: () => send('back'),
        },
        {
          label: '前进',
          accelerator: 'Alt+Right',
          click: () => send('forward'),
        },
      ],
    },
    { role: 'windowMenu', label: '窗口' },
    { role: 'help', label: '帮助' },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
