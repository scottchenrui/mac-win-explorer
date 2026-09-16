import { visibleEntries } from '../store/visibleEntries';
import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { toast } from '../store/toastStore';
import { formatBytes, formatDateTime, iconCategoryFor } from '@shared/format';
import type { FsEntry, SortKey } from '@shared/types';
import { Icon } from './Icons';
import { Menu, useContextMenu, type MenuItem } from './Menu';
import {
  DEFAULT_COL_WIDTHS,
  useAppStore,
  type ColWidthKey,
  type ViewMode,
} from '../store/appStore';
import { useDialogStore } from '../store/dialogStore';
import { useFileActions } from '../hooks/useFileActions';
import { useEntryIcons } from '../hooks/useEntryIcons';
import { isModPressed } from '../utils/platform';
import { api } from '../api';

const ROW_HEIGHT = 28;
const GRID_ROW_HEIGHT = 100;
const GRID_ITEM_WIDTH = 116;
const OVERSCAN = 4;
/** 慢双击进入重命名的等待窗口：第二次点击后这么久内没有新点击，就当作重命名而不是双击打开 */
const SLOW_CLICK_RENAME_MS = 400;

function EntryIcon({ entry, icons, size }: { entry: FsEntry; icons: Map<string, string | null>; size: number }): JSX.Element {
  const url = icons.get(entry.path);
  if (url) return <img className="entryicon" src={url} alt="" width={size} height={size} />;
  return <Icon name={iconCategoryFor(entry.kind, entry.isPackage, entry.ext)} size={size} />;
}

interface RowProps {
  entry: FsEntry;
  selected: boolean;
  dimmed: boolean;
  view: ViewMode;
  icons: Map<string, string | null>;
  renaming: boolean;
  onSelect: (e: React.MouseEvent, entry: FsEntry) => void;
  onOpen: (entry: FsEntry) => void;
  onMenu: (e: React.MouseEvent, entry: FsEntry) => void;
  onCommitRename: (entry: FsEntry, name: string) => void;
  onCancelRename: () => void;
}

/**
 * 行内重命名输入框。
 *
 * 两个关键细节：
 * 1. 输入法组合态下按回车是"选候选词"，绝不能当成提交 —— 否则中文用户
 *    打完名字一按回车就被截断提交，只能重命名出半个词。
 * 2. 输入框上的鼠标事件必须阻止冒泡，否则点一下就会被当成选中/打开该行。
 */
function RenameInput({
  entry,
  onCommit,
  onCancel,
}: {
  entry: FsEntry;
  onCommit: (name: string) => void;
  onCancel: () => void;
}): JSX.Element {
  // 提交/取消后不再接受后续的 blur 提交
  const settled = useRef(false);

  return (
    <input
      className="row__rename"
      defaultValue={entry.name}
      autoFocus
      spellCheck={false}
      // 与 Windows 一致：自动选中主文件名，保留扩展名不被改动
      onFocus={(e) => {
        const dot = entry.kind === 'dir' ? -1 : entry.name.lastIndexOf('.');
        e.currentTarget.setSelectionRange(0, dot > 0 ? dot : entry.name.length);
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.nativeEvent.isComposing || e.keyCode === 229) return;
        if (e.key === 'Enter') {
          e.preventDefault();
          settled.current = true;
          onCommit(e.currentTarget.value);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          settled.current = true;
          onCancel();
        }
      }}
      // 点击别处 = 确认（Windows 行为）；但按下 Esc 后 settled 已置位，不会重复提交
      onBlur={(e) => {
        if (settled.current) return;
        settled.current = true;
        onCommit(e.currentTarget.value);
      }}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
    />
  );
}

function Row({
  entry,
  selected,
  dimmed,
  view,
  icons,
  renaming,
  onSelect,
  onOpen,
  onMenu,
  onCommitRename,
  onCancelRename,
}: RowProps): JSX.Element {
  const className = [
    'row',
    `row--${view}`,
    selected ? 'is-selected' : '',
    dimmed ? 'is-dimmed' : '',
    entry.isHidden ? 'is-hidden-file' : '',
  ]
    .filter(Boolean)
    .join(' ');

  if (view === 'icons') {
    return (
      <div
        className={className}
        onClick={(e) => onSelect(e, entry)}
        onDoubleClick={() => onOpen(entry)}
        onContextMenu={(e) => onMenu(e, entry)}
        title={entry.name}
      >
        <div className="tile__icon">
          <EntryIcon entry={entry} icons={icons} size={48} />
        </div>
        {renaming ? (
          <RenameInput entry={entry} onCommit={(n) => onCommitRename(entry, n)} onCancel={onCancelRename} />
        ) : (
          <div className="tile__name">{entry.name}</div>
        )}
      </div>
    );
  }

  return (
    <div
      className={className}
      onClick={(e) => onSelect(e, entry)}
      onDoubleClick={() => onOpen(entry)}
      onContextMenu={(e) => onMenu(e, entry)}
      title={entry.name}
    >
      <span className="row__icon">
        <EntryIcon entry={entry} icons={icons} size={view === 'details' ? 20 : 16} />
      </span>
      {renaming ? (
        <RenameInput entry={entry} onCommit={(n) => onCommitRename(entry, n)} onCancel={onCancelRename} />
      ) : (
        <span className="row__name">{entry.name}</span>
      )}
      {view === 'details' && (
        <>
          <span className="row__cell row__cell--date">{formatDateTime(entry.mtime)}</span>
          <span className="row__cell row__cell--type">{entry.typeLabel}</span>
          <span className="row__cell row__cell--size">
            {entry.kind === 'dir' ? '' : formatBytes(entry.size)}
          </span>
        </>
      )}
    </div>
  );
}

const COLUMNS: Array<{
  key: SortKey;
  label: string;
  className: string;
  /** 可拖拽调宽的列名；名称列自动占满剩余空间，不参与 */
  widthKey?: ColWidthKey;
}> = [
  { key: 'name', label: '名称', className: 'col--name' },
  { key: 'mtime', label: '修改日期', className: 'col--date', widthKey: 'date' },
  { key: 'type', label: '类型', className: 'col--type', widthKey: 'type' },
  { key: 'size', label: '大小', className: 'col--size', widthKey: 'size' },
];

/**
 * 内容区：三种视图 + 窗口化渲染。
 *
 * 窗口化是必须的 —— /Applications 这类目录动辄上千项，
 * 全部渲染成 DOM 会让滚动明显掉帧。
 */
export function FileList(): JSX.Element {
  const app = useAppStore();
  const dialog = useDialogStore();
  const actions = useFileActions();
  const icons = useEntryIcons(app.entries);
  const { state: menuState, open: openMenu, close: closeMenu } = useContextMenu();

  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [size, setSize] = useState({ width: 900, height: 600 });
  const [resizing, setResizing] = useState<ColWidthKey | null>(null);

  /**
   * 慢双击重命名的待定状态。
   *
   * 双击已经被“打开”占用，所以鼠标重命名采用 Finder/Windows 的区分方式：
   * 点击已选中的项目后等一拍，期间没有新点击（不是快速双击）就进入行内重命名；
   * 快速双击则清掉定时器照旧打开。
   */
  const pendingRenameRef = useRef<{ path: string; timer: number } | null>(null);

  const cancelPendingRename = (): void => {
    if (pendingRenameRef.current) {
      window.clearTimeout(pendingRenameRef.current.timer);
      pendingRenameRef.current = null;
    }
  };

  useEffect(() => cancelPendingRename, []);

  /**
   * 拖拽调整列宽。
   *
   * 监听挂在 window 上而不是把手元素上 —— 鼠标拖出把手范围（很常见）时
   * 事件才不会断。把手贴在列头右边缘，向右拖即加宽该列（与 Windows 一致）。
   */
  const startResize = (e: React.MouseEvent, key: ColWidthKey): void => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = app.colWidths[key];
    setResizing(key);

    const onMove = (ev: MouseEvent): void => {
      app.setColWidth(key, startWidth + (ev.clientX - startX));
    };
    const onUp = (): void => {
      setResizing(null);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      setSize({ width: el.clientWidth, height: el.clientHeight });
    });
    observer.observe(el);
    setSize({ width: el.clientWidth, height: el.clientHeight });
    return () => observer.disconnect();
  }, []);

  // 切换目录时回到顶部，并结束可能正在进行的行内重命名与待定重命名
  useEffect(() => {
    setScrollTop(0);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    app.endInlineRename();
    cancelPendingRename();
  }, [app.path]);

  const visible = useMemo(() => visibleEntries(app), [app.entries, app.filter]);

  const isGrid = app.view === 'icons';
  const cols = isGrid ? Math.max(1, Math.floor(size.width / GRID_ITEM_WIDTH)) : 1;
  const rowHeight = isGrid ? GRID_ROW_HEIGHT : ROW_HEIGHT;
  const rowCount = Math.ceil(visible.length / cols);
  const startRow = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN);
  const endRow = Math.min(rowCount, Math.ceil((scrollTop + size.height) / rowHeight) + OVERSCAN);
  const slice = visible.slice(startRow * cols, endRow * cols);

  const selectedSet = useMemo(() => new Set(app.selection), [app.selection]);
  const dimmedSet = useMemo(
    () => new Set(app.clipboard?.mode === 'move' ? app.clipboard.paths : []),
    [app.clipboard],
  );

  /** 提交行内重命名；空名或没改名直接收工，不打扰用户 */
  const commitRename = async (entry: FsEntry, rawName: string): Promise<void> => {
    app.endInlineRename();
    const name = rawName.trim();
    if (!name || name === entry.name) return;

    const result = await api.rename({ path: entry.path, newName: name });
    if (!result.ok) {
      toast('error', result.error.message);
      return;
    }
    await app.refresh();
    useAppStore.setState({ selection: [result.data.path], anchor: result.data.path });
  };

  const handleSelect = (e: React.MouseEvent, entry: FsEntry): void => {
    if (isModPressed(e)) {
      cancelPendingRename();
      app.toggleSelect(entry.path);
      return;
    }
    if (e.shiftKey) {
      cancelPendingRename();
      app.selectRange(entry.path);
      return;
    }

    const wasOnlySelected = app.selection.length === 1 && app.selection[0] === entry.path;
    app.selectOnly(entry.path);

    if (!wasOnlySelected || app.renamingPath) {
      cancelPendingRename();
      return;
    }

    if (pendingRenameRef.current?.path === entry.path) {
      // 短时间内第二次点同一项：是快速双击的第一拍，交给 dblclick 去打开，别误入重命名
      cancelPendingRename();
      return;
    }

    // 点击已选中项：等一拍，没有后续点击就进入行内重命名（Finder 同款交互）
    const timer = window.setTimeout(() => {
      pendingRenameRef.current = null;
      actions.startRename(entry);
    }, SLOW_CLICK_RENAME_MS);
    pendingRenameRef.current = { path: entry.path, timer };
  };

  /** 点空白区域（不是任何行）时清空选择 */
  const handleBlankClick = (e: React.MouseEvent): void => {
    const el = e.target as HTMLElement;
    if (
      el.classList.contains('filelist__scroll') ||
      el.classList.contains('filelist__canvas') ||
      el.classList.contains('filelist__inner')
    ) {
      cancelPendingRename();
      app.clearSelection();
    }
  };

  const buildItemMenu = (targets: string[], primary: FsEntry): MenuItem[] => [
    {
      id: 'open',
      label: primary.kind === 'dir' ? '打开' : '用默认程序打开',
      icon: primary.kind === 'dir' ? 'folder' : 'app',
      onClick: () => void actions.openEntry(primary),
    },
    {
      id: 'reveal',
      label: '在访达中显示',
      icon: 'computer',
      disabled: !app.nativeOps,
      onClick: () => void actions.revealInSystem(primary.path),
      separatorBefore: true,
    },
    {
      id: 'cut',
      label: '剪切',
      icon: 'cut',
      shortcut: `${app.modLabel}X`,
      onClick: actions.cutSelection,
      separatorBefore: true,
    },
    { id: 'copy', label: '复制', icon: 'copy', shortcut: `${app.modLabel}C`, onClick: actions.copySelection },
    {
      id: 'copyPath',
      label: '复制路径',
      icon: 'copyPath',
      shortcut: `⇧${app.modLabel}C`,
      onClick: () => void actions.copyPathsToClipboard(targets),
    },
    {
      id: 'rename',
      label: '重命名',
      icon: 'rename',
      shortcut: 'F2',
      disabled: targets.length !== 1,
      onClick: () => actions.startRename(primary),
      separatorBefore: true,
    },
    {
      id: 'delete',
      label: '移到废纸篓',
      icon: 'trash',
      shortcut: `${app.modLabel}⌫`,
      onClick: () => actions.requestDelete(targets),
    },
    {
      id: 'properties',
      label: '属性',
      icon: 'info',
      onClick: () => actions.showProperties(primary),
      separatorBefore: true,
    },
  ];

  const handleItemMenu = (e: React.MouseEvent, entry: FsEntry): void => {
    // 阻止冒泡，否则会接着触发空白区菜单把它覆盖掉
    e.stopPropagation();
    if (!selectedSet.has(entry.path)) app.selectOnly(entry.path);
    const targets = selectedSet.has(entry.path) ? app.selection : [entry.path];
    openMenu(e, buildItemMenu(targets, entry));
  };

  const handleBlankMenu = (e: React.MouseEvent): void => {
    const el = e.target as HTMLElement;
    if (!el.classList.contains('filelist__scroll') && !el.classList.contains('filelist__canvas') && !el.classList.contains('filelist__inner')) {
      return;
    }
    openMenu(e, [
      {
        id: 'newFolder',
        label: '新建文件夹',
        icon: 'folder',
        shortcut: `⇧${app.modLabel}N`,
        onClick: () => dialog.open({ kind: 'newFolder' }),
      },
      {
        id: 'newFile',
        label: '新建文件',
        icon: 'generic',
        onClick: () => dialog.open({ kind: 'newFile' }),
      },
      {
        id: 'paste',
        label: '粘贴',
        icon: 'paste',
        disabled: !app.clipboard,
        onClick: () => void actions.pasteHere(),
        separatorBefore: true,
      },
      {
        id: 'refresh',
        label: '刷新',
        icon: 'refresh',
        shortcut: 'F5',
        onClick: () => void app.refresh(),
        separatorBefore: true,
      },
      {
        id: 'props',
        label: '属性',
        icon: 'info',
        onClick: () => void showFolderProperties(),
        separatorBefore: true,
      },
    ]);
  };

  /** 当前文件夹的属性 */
  const showFolderProperties = async (): Promise<void> => {
    const result = await api.statOne({ path: app.path });
    if (result.ok) actions.showProperties(result.data);
  };

  const sortArrow = (key: SortKey): string => (app.sort.key !== key ? '' : app.sort.dir === 'asc' ? ' ▲' : ' ▼');

  if (app.error) {
    return (
      <div className="filelist filelist--empty">
        <div className="emptystate">
          <Icon name="warning" size={40} />
          <p className="emptystate__title">{app.error.message}</p>
          {app.error.code === 'EACCES' && (
            <p className="emptystate__hint">
              若访问的是"桌面""文稿""下载"等受保护目录，请到
              <b> 系统设置 → 隐私与安全性 → 完全磁盘访问权限 </b>
              为本应用授权。
            </p>
          )}
          <button type="button" className="btn" onClick={() => void app.refresh()}>
            重试
          </button>
        </div>
      </div>
    );
  }

  // 列宽以 CSS 变量下发：列头与数据行读取同一组变量，宽度不可能对不上
  const colVars = {
    '--col-date': `${app.colWidths.date}px`,
    '--col-type': `${app.colWidths.type}px`,
    '--col-size': `${app.colWidths.size}px`,
  } as React.CSSProperties;

  return (
    <div className={`filelist${resizing ? ' is-resizing' : ''}`} style={colVars}>
      {app.view === 'details' && (
        <div className="filelist__head">
          {COLUMNS.map((col) => {
            const widthKey = col.widthKey;
            return (
              <button
                key={col.key}
                type="button"
                className={`col ${col.className}${app.sort.key === col.key ? ' is-sorted' : ''}`}
                onClick={() => app.setSort(col.key)}
              >
                {widthKey && (
                  <span
                    className={`col__resizer${resizing === widthKey ? ' is-active' : ''}`}
                    title="拖动调整列宽，双击恢复默认"
                    onMouseDown={(e) => startResize(e, widthKey)}
                    // 阻止冒泡，否则拖完一松手会顺带触发排序
                    onClick={(e) => e.stopPropagation()}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      app.setColWidth(widthKey, DEFAULT_COL_WIDTHS[widthKey]);
                    }}
                  />
                )}
                {col.label}
                <span className="col__arrow">{sortArrow(col.key)}</span>
              </button>
            );
          })}
        </div>
      )}

      <div
        className="filelist__scroll"
        ref={scrollRef}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        onMouseDown={handleBlankClick}
        onContextMenu={handleBlankMenu}
      >
        {app.loading && visible.length === 0 ? (
          <div className="emptystate">
            <p>正在加载…</p>
          </div>
        ) : visible.length === 0 ? (
          <div className="emptystate">
            <Icon name="folder" size={40} />
            <p>{app.filter ? '没有匹配的项目' : '此文件夹为空'}</p>
          </div>
        ) : (
          <div
            className={isGrid ? 'filelist__canvas filelist__canvas--grid' : 'filelist__canvas'}
            style={{ height: rowCount * rowHeight }}
          >
            <div
              className="filelist__inner"
              style={{
                transform: `translateY(${startRow * rowHeight}px)`,
                // 列数与 JS 侧保持一致，否则虚拟化会出现错位
                gridTemplateColumns: isGrid ? `repeat(${cols}, minmax(0, 1fr))` : undefined,
              }}
            >
              {slice.map((entry) => (
                <Row
                  key={entry.path}
                  entry={entry}
                  selected={selectedSet.has(entry.path)}
                  dimmed={dimmedSet.has(entry.path)}
                  view={app.view}
                  icons={icons}
                  renaming={app.renamingPath === entry.path}
                  onSelect={handleSelect}
                  onOpen={(e) => {
                    // 双击打开前取消待定重命名，避免 400ms 后又弹出行内编辑框
                    cancelPendingRename();
                    void actions.openEntry(e);
                  }}
                  onMenu={handleItemMenu}
                  onCommitRename={(e, name) => void commitRename(e, name)}
                  onCancelRename={app.endInlineRename}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {app.warning && <div className="filelist__warning">{app.warning.message}</div>}
      {app.truncated && (
        <div className="filelist__warning">项目过多，仅显示前 {visible.length} 个。</div>
      )}

      {menuState && <Menu items={menuState.items} x={menuState.x} y={menuState.y} onClose={closeMenu} />}
    </div>
  );
}
