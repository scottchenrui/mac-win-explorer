import { useRef, useState, type JSX } from 'react';
import { Icon, type IconName } from './Icons';
import { Menu, type MenuItem } from './Menu';
import { useAppStore, type ViewMode } from '../store/appStore';
import { useDialogStore } from '../store/dialogStore';
import { useFileActions } from '../hooks/useFileActions';
import { modLabel } from '../utils/platform';

interface CmdButtonProps {
  icon: IconName;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  title?: string;
  menu?: MenuItem[];
}

/**
 * Windows 11 命令栏按钮：图标在上、文字在下。
 *
 * 同时给了 onClick 与 menu 时是分裂按钮（如“新建”）：
 * 主按钮直接执行主操作，右侧小箭头展开更多选项。
 */
function CmdButton({ icon, label, onClick, disabled, active, title, menu }: CmdButtonProps): JSX.Element {
  const anchor = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const split = Boolean(menu && onClick);

  return (
    <div className="cmdbar__wrap" ref={anchor}>
      <button
        type="button"
        className={`cmdbar__btn${disabled ? ' is-disabled' : ''}${active ? ' is-active' : ''}`}
        disabled={disabled}
        aria-haspopup={menu && !split ? 'menu' : undefined}
        aria-expanded={menu && !split ? open : undefined}
        title={title ?? label}
        onClick={() => {
          // 纯菜单按钮（如“查看”）：点主区域展开菜单；分裂按钮：执行主操作
          if (menu && !onClick) {
            setOpen((v) => !v);
            return;
          }
          onClick?.();
        }}
      >
        <Icon name={icon} size={20} />
        <span>{label}</span>
        {menu && !split && <Icon name="chevronDown" size={10} className="cmdbar__caret" />}
      </button>
      {split && (
        <button
          type="button"
          className="cmdbar__drop"
          disabled={disabled}
          title="更多选项"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <Icon name="chevronDown" size={10} />
        </button>
      )}
      {menu && open && (
          <Menu
            anchor={anchor}
            items={menu}
            x={0}
            y={0}
            onClose={() => setOpen(false)}
          />
      )}
    </div>
  );
}

const VIEW_ITEMS: Array<{ id: ViewMode; label: string; icon: IconName }> = [
  { id: 'icons', label: '大图标', icon: 'viewIcons' },
  { id: 'list', label: '列表', icon: 'viewList' },
  { id: 'details', label: '详细信息', icon: 'viewDetails' },
];

/**
 * 命令栏（Windows 11 资源管理器风格）。
 *
 * 原生能力不可用时（浏览器预览模式）按钮自动灰显，而不是点了才报错。
 */
export function CommandBar(): JSX.Element {
  const app = useAppStore();
  const dialog = useDialogStore();
  const actions = useFileActions();

  const hasSelection = app.selection.length > 0;
  const single = app.selection.length === 1;
  const firstEntry = app.entries.find((e) => e.path === app.selection[0]) ?? null;

  const newItems: MenuItem[] = [
    { id: 'folder', label: '文件夹', icon: 'folder', shortcut: `⇧${modLabel()}N`, onClick: () => dialog.open({ kind: 'newFolder' }) },
    { id: 'file', label: '文件', icon: 'generic', onClick: () => dialog.open({ kind: 'newFile' }) },
  ];

  const viewItems: MenuItem[] = VIEW_ITEMS.map((v) => ({
    id: v.id,
    label: v.label,
    icon: v.icon,
    checked: app.view === v.id,
    onClick: () => app.setView(v.id),
  }));

  return (
    <div className="cmdbar" role="toolbar">
      <CmdButton
        icon="new"
        label="新建"
        onClick={() => void actions.createFolderQuick()}
        menu={newItems}
        title="新建文件夹"
      />

      <span className="cmdbar__sep" />

      <CmdButton icon="cut" label="剪切" disabled={!hasSelection} onClick={actions.cutSelection} title={`剪切 (${modLabel()}X)`} />
      <CmdButton icon="copy" label="复制" disabled={!hasSelection} onClick={actions.copySelection} title={`复制 (${modLabel()}C)`} />
      <CmdButton icon="paste" label="粘贴" disabled={!app.clipboard} onClick={() => void actions.pasteHere()} title={`粘贴 (${modLabel()}V)`} />
      <CmdButton
        icon="copyPath"
        label="复制路径"
        disabled={!hasSelection}
        onClick={() => void actions.copyPathsToClipboard()}
        title={`复制完整路径 (⇧${modLabel()}C)`}
      />

      <span className="cmdbar__sep" />

      <CmdButton icon="rename" label="重命名" disabled={!single} onClick={() => firstEntry && actions.startRename(firstEntry)} title="重命名 (F2)" />
      <CmdButton icon="trash" label="删除" disabled={!hasSelection} onClick={() => actions.requestDelete()} title={`移到废纸篓 (${modLabel}⌫)`} />
      <CmdButton
        icon="computer"
        label="在访达中显示"
        disabled={!app.nativeOps || !hasSelection}
        onClick={() => firstEntry && void actions.revealInSystem(firstEntry.path)}
        title={app.nativeOps ? '在 Finder 中显示' : '仅在桌面版可用'}
      />

      <span className="cmdbar__spacer" />

      <CmdButton icon={app.showHidden ? 'eyeOff' : 'eye'} label={app.showHidden ? '隐藏项目' : '隐藏的文件'} active={app.showHidden} onClick={app.toggleHidden} title={`切换显示隐藏文件 (⇧${modLabel()}.)`} />
      <CmdButton
        icon={VIEW_ITEMS.find((v) => v.id === app.view)?.icon ?? 'viewDetails'}
        label="查看"
        menu={viewItems}
      />
      <CmdButton icon="refresh" label="刷新" onClick={() => void app.refresh()} title="刷新 (F5)" />
    </div>
  );
}
