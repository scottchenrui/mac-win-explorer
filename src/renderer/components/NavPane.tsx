import { useCallback, useEffect, useState, type JSX } from 'react';
import { Icon, type IconName } from './Icons';
import { Menu, useContextMenu, type MenuItem } from './Menu';
import { useAppStore } from '../store/appStore';
import { useFileActions } from '../hooks/useFileActions';
import { onTransferDone } from '../store/transferStore';
import { formatBytes } from '@shared/format';
import { api } from '../api';

interface ChildDir {
  name: string;
  path: string;
}

/** 单个树节点：展开时才去取子目录，避免打开就全盘扫描 */
function TreeItem({
  name,
  path,
  depth,
  onMenu,
}: {
  name: string;
  path: string;
  depth: number;
  onMenu: (e: React.MouseEvent, path: string) => void;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const [children, setChildren] = useState<ChildDir[] | null>(null);
  const [loading, setLoading] = useState(false);

  const currentPath = useAppStore((s) => s.path);
  const navigate = useAppStore((s) => s.navigate);
  const showHidden = useAppStore((s) => s.showHidden);

  const loadChildren = useCallback(async () => {
    setLoading(true);
    const result = await api.listDir({ path, sort: { key: 'name', dir: 'asc' }, showHidden });
    setLoading(false);
    if (result.ok) {
      setChildren(
        result.data.entries
          .filter((entry) => entry.kind === 'dir' && !entry.isPackage)
          .map((entry) => ({ name: entry.name, path: entry.path })),
      );
    } else {
      setChildren([]);
    }
  }, [path, showHidden]);

  const toggle = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!open && children === null) await loadChildren();
      setOpen((v) => !v);
    },
    [open, children, loadChildren],
  );

  // 有传输写入本目录（如粘贴到该文件夹）且节点已展开时，重新拉取子项
  useEffect(() => {
    if (!open) return;
    return onTransferDone((destDir) => {
      if (destDir === path) void loadChildren();
    });
  }, [open, path, loadChildren]);

  const isCurrent = currentPath === path;

  return (
    <>
      <div
        className={`navitem${isCurrent ? ' is-current' : ''}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => void navigate(path)}
        onContextMenu={(e) => onMenu(e, path)}
        title={path}
      >
        <button type="button" className="navitem__twist" onClick={(e) => void toggle(e)} aria-label={open ? '折叠' : '展开'}>
          {loading ? (
            <span className="navitem__spin" />
          ) : (
            <Icon name={open ? 'chevronDown' : 'chevronRight'} size={12} />
          )}
        </button>
        <span className="navitem__icon">
          <Icon name="folder" size={16} />
        </span>
        <span className="navitem__label">{name}</span>
      </div>
      {open &&
        (children ?? []).map((child) => (
          <TreeItem key={child.path} name={child.name} path={child.path} depth={depth + 1} onMenu={onMenu} />
        ))}
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="navsection">
      <div className="navsection__title">{title}</div>
      {children}
    </div>
  );
}

/** 左侧导航窗格：快速访问 + 此电脑（磁盘卷与目录树） */
export function NavPane(): JSX.Element {
  const quick = useAppStore((s) => s.quick);
  const volumes = useAppStore((s) => s.volumes);
  const path = useAppStore((s) => s.path);
  const navigate = useAppStore((s) => s.navigate);
  const modKey = useAppStore((s) => s.modLabel);
  const actions = useFileActions();
  const { state: menuState, open: openMenu, close: closeMenu } = useContextMenu();

  /**
   * 导航项右键菜单：把已复制/剪切的项目粘贴到该文件夹。
   * 磁盘卷（如整块硬盘）不作为复制源，只提供粘贴，避免误拷整盘。
   */
  const openNavMenu = (e: React.MouseEvent, folderPath: string, copyable: boolean): void => {
    e.preventDefault();
    e.stopPropagation();
    const hasClip = Boolean(useAppStore.getState().clipboard);
    const items: MenuItem[] = [];
    if (copyable) {
      items.push(
        { id: 'copy', label: '复制', icon: 'copy', shortcut: `${modKey}C`, onClick: () => actions.copyPaths([folderPath]) },
        { id: 'cut', label: '剪切', icon: 'cut', shortcut: `${modKey}X`, onClick: () => actions.cutPaths([folderPath]) },
      );
    }
    items.push({
      id: 'paste',
      label: '粘贴',
      icon: 'paste',
      shortcut: `${modKey}V`,
      disabled: !hasClip,
      onClick: () => void actions.pasteTo(folderPath),
      separatorBefore: copyable,
    });
    openMenu(e, items);
  };

  const handleFolderMenu = (e: React.MouseEvent, folderPath: string): void =>
    openNavMenu(e, folderPath, true);

  return (
    <aside className="navpane">
      <Section title="快速访问">
        {quick.map((item) => (
          <div
            key={item.id}
            className={`navitem${path === item.path ? ' is-current' : ''}`}
            onClick={() => void navigate(item.path)}
            onContextMenu={(e) => openNavMenu(e, item.path, true)}
            title={item.path}
          >
            <span className="navitem__twist navitem__twist--empty" />
            <span className="navitem__icon">
              <Icon name={item.iconId as IconName} size={16} />
            </span>
            <span className="navitem__label">{item.name}</span>
          </div>
        ))}
      </Section>

      <Section title="此电脑">
        {volumes.map((volume) => (
          <div key={volume.path}>
            <div
              className={`navitem${path === volume.path ? ' is-current' : ''}`}
              onClick={() => void navigate(volume.path)}
              onContextMenu={(e) => openNavMenu(e, volume.path, false)}
              title={volume.path}
            >
              <span className="navitem__twist navitem__twist--empty" />
              <span className="navitem__icon">
                <Icon name="computer" size={16} />
              </span>
              <span className="navitem__label">{volume.name}</span>
            </div>
            {volume.capacityKnown && (
              <div className="navitem__capacity">
                <div className="capacitybar">
                  <div
                    className="capacitybar__used"
                    style={{ width: `${Math.round(((volume.total - volume.free) / volume.total) * 100)}%` }}
                  />
                </div>
                <span className="navitem__capacitytext">
                  {formatBytes(volume.free)} 可用 / {formatBytes(volume.total)}
                </span>
              </div>
            )}
            {volume.path === '/' && <TreeItem name="用户" path="/Users" depth={1} onMenu={handleFolderMenu} />}
          </div>
        ))}
      </Section>

      {menuState && <Menu items={menuState.items} x={menuState.x} y={menuState.y} onClose={closeMenu} />}
    </aside>
  );
}
