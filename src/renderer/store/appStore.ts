import { create } from 'zustand';
import { makeComparator } from '@shared/sort';
import type { AppError } from '@shared/errors';
import type { FsEntry, QuickItem, SortKey, SortSpec, VolumeInfo } from '@shared/types';
import { api } from '../api';
import { loadPref, savePref } from './persist';

export type ViewMode = 'details' | 'list' | 'icons';

/** 可拖拽调宽的三列（名称列自动占满剩余空间） */
export type ColWidthKey = 'date' | 'type' | 'size';
export interface ColWidths {
  date: number;
  type: number;
  size: number;
}

export const DEFAULT_COL_WIDTHS: ColWidths = { date: 152, type: 132, size: 96 };
const MIN_COL_WIDTH = 56;
const MAX_COL_WIDTH = 480;

function clampWidth(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(MAX_COL_WIDTH, Math.max(MIN_COL_WIDTH, Math.round(value)));
}

function loadColWidths(): ColWidths {
  return loadPref<ColWidths>('colWidths', { ...DEFAULT_COL_WIDTHS }, (v) => {
    if (typeof v !== 'object' || v === null) return null;
    const raw = v as Partial<Record<ColWidthKey, unknown>>;
    return {
      date: clampWidth(raw.date, DEFAULT_COL_WIDTHS.date),
      type: clampWidth(raw.type, DEFAULT_COL_WIDTHS.type),
      size: clampWidth(raw.size, DEFAULT_COL_WIDTHS.size),
    };
  });
}

function loadView(): ViewMode {
  return loadPref<ViewMode>('view', 'details', (v) =>
    v === 'details' || v === 'list' || v === 'icons' ? v : null,
  );
}

function loadSort(): SortSpec {
  return loadPref<SortSpec>('sort', { key: 'name', dir: 'asc' }, (v) => {
    if (typeof v !== 'object' || v === null) return null;
    const raw = v as Partial<SortSpec>;
    const keys: SortKey[] = ['name', 'mtime', 'type', 'size'];
    if (!raw.key || !keys.includes(raw.key)) return null;
    return { key: raw.key, dir: raw.dir === 'desc' ? 'desc' : 'asc' };
  });
}

function loadShowHidden(): boolean {
  return loadPref<boolean>('showHidden', false, (v) => (typeof v === 'boolean' ? v : null));
}

export interface ClipboardState {
  mode: 'copy' | 'move';
  paths: string[];
}

interface AppState {
  initialized: boolean;

  // 导航
  path: string;
  history: string[];
  historyIndex: number;

  // 目录内容
  entries: FsEntry[];
  loading: boolean;
  error: AppError | null;
  warning: AppError | null;
  truncated: boolean;

  // 视图
  sort: SortSpec;
  view: ViewMode;
  showHidden: boolean;
  filter: string;
  /** 详细信息视图下可拖拽的列宽，跨会话保留 */
  colWidths: ColWidths;

  // 选择
  selection: string[];
  anchor: string | null;

  clipboard: ClipboardState | null;

  /** 正在行内重命名的条目路径；null 表示没有。与对话框互斥（Windows 是行内编辑） */
  renamingPath: string | null;

  // 左侧导航
  quick: QuickItem[];
  volumes: VolumeInfo[];

  // 运行环境
  nativeOps: boolean;
  modLabel: string;
  homePath: string;
  appVersion: string;
}

interface AppActions {
  init: () => Promise<void>;
  load: () => Promise<void>;
  navigate: (target: string) => Promise<void>;
  back: () => Promise<void>;
  forward: () => Promise<void>;
  up: () => Promise<void>;
  refresh: () => Promise<void>;

  setSort: (key: SortKey) => void;
  setView: (view: ViewMode) => void;
  toggleHidden: () => void;
  setFilter: (filter: string) => void;
  setColWidth: (key: ColWidthKey, width: number) => void;
  resetColWidths: () => void;

  selectOnly: (path: string) => void;
  toggleSelect: (path: string) => void;
  selectRange: (path: string) => void;
  selectAll: () => void;
  invertSelection: () => void;
  clearSelection: () => void;

  setClipboard: (mode: 'copy' | 'move', paths: string[]) => void;
  clearClipboard: () => void;

  startInlineRename: (path: string) => void;
  endInlineRename: () => void;
}

export type AppStore = AppState & AppActions;

/** 丢弃过期响应：React StrictMode 与快速连续导航都会产生竞态 */
let loadSeq = 0;

function parentOf(target: string): string {
  const idx = target.lastIndexOf('/');
  if (idx <= 0) return '/';
  return target.slice(0, idx);
}

export const useAppStore = create<AppStore>()((set, get) => ({
  initialized: false,

  path: '',
  history: [],
  historyIndex: -1,

  entries: [],
  loading: false,
  error: null,
  warning: null,
  truncated: false,

  sort: loadSort(),
  view: loadView(),
  showHidden: loadShowHidden(),
  filter: '',
  colWidths: loadColWidths(),

  selection: [],
  anchor: null,

  clipboard: null,
  renamingPath: null,

  quick: [],
  volumes: [],

  nativeOps: false,
  modLabel: 'Ctrl',
  homePath: '/',
  appVersion: '0.0.0',

  init: async () => {
    if (get().initialized) return;
    set({ initialized: true });

    const caps = await api.capabilities();
    if (caps.ok) {
      set({
        nativeOps: caps.data.nativeOps,
        modLabel: caps.data.modLabel,
        homePath: caps.data.homePath,
        appVersion: caps.data.appVersion,
      });
    }

    const roots = await api.getRoots();
    if (roots.ok) {
      set({ quick: roots.data.quick, volumes: roots.data.volumes });
    }

    // 新窗口由主进程注入初始目录（与来源窗口同一位置）；无效则回退主目录
    let target = caps.ok ? caps.data.homePath : '/';
    const initial = window.electronAPI?.initialPath;
    if (initial) {
      const st = await api.statOne({ path: initial });
      if (st.ok && st.data.kind === 'dir') target = initial;
    }
    await get().navigate(target);
  },

  load: async () => {
    const seq = ++loadSeq;
    set({ loading: true, error: null });

    const result = await api.listDir({
      path: get().path,
      sort: get().sort,
      showHidden: get().showHidden,
    });

    if (seq !== loadSeq) return;

    if (!result.ok) {
      set({ loading: false, error: result.error, entries: [], selection: [] });
      return;
    }
    set({
      loading: false,
      path: result.data.path,
      entries: result.data.entries,
      warning: result.data.warning ?? null,
      truncated: result.data.truncated,
      // 目录切换后旧的选中项已无意义
      selection: [],
      anchor: null,
    });
  },

  navigate: async (target) => {
    const { history, historyIndex } = get();
    if (target === get().path) {
      await get().refresh();
      return;
    }
    const next = [...history.slice(0, historyIndex + 1), target].slice(-100);
    set({ path: target, history: next, historyIndex: next.length - 1 });
    await get().load();
  },

  back: async () => {
    const { historyIndex, history } = get();
    if (historyIndex <= 0) return;
    const index = historyIndex - 1;
    set({ historyIndex: index, path: history[index] });
    await get().load();
  },

  forward: async () => {
    const { historyIndex, history } = get();
    if (historyIndex >= history.length - 1) return;
    const index = historyIndex + 1;
    set({ historyIndex: index, path: history[index] });
    await get().load();
  },

  up: async () => {
    const parent = parentOf(get().path);
    if (parent === get().path) return;
    await get().navigate(parent);
  },

  refresh: async () => {
    await get().load();
  },

  setSort: (key) => {
    const current = get().sort;
    const next: SortSpec =
      current.key === key
        ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' };
    // 本地重排，避免点一次列头就跑一趟网络
    set({ sort: next, entries: [...get().entries].sort(makeComparator(next)) });
    savePref('sort', next);
  },

  setView: (view) => {
    set({ view });
    savePref('view', view);
  },

  toggleHidden: () => {
    const next = !get().showHidden;
    set({ showHidden: next });
    savePref('showHidden', next);
    void get().load();
  },

  setFilter: (filter) => set({ filter }),

  setColWidth: (key, width) => {
    const next = { ...get().colWidths, [key]: clampWidth(width, DEFAULT_COL_WIDTHS[key]) };
    set({ colWidths: next });
    savePref('colWidths', next);
  },

  resetColWidths: () => {
    const next = { ...DEFAULT_COL_WIDTHS };
    set({ colWidths: next });
    savePref('colWidths', next);
  },

  selectOnly: (path) => set({ selection: [path], anchor: path }),

  toggleSelect: (path) => {
    const selection = get().selection;
    const next = selection.includes(path)
      ? selection.filter((p) => p !== path)
      : [...selection, path];
    set({ selection: next, anchor: path });
  },

  selectRange: (path) => {
    const { entries, anchor, selection } = get();
    const names = entries.map((e) => e.path);
    const to = names.indexOf(path);
    const from = anchor ? names.indexOf(anchor) : 0;
    if (to < 0 || from < 0) {
      set({ selection: [path], anchor: path });
      return;
    }
    const [lo, hi] = from <= to ? [from, to] : [to, from];
    const range = names.slice(lo, hi + 1);
    set({ selection: [...new Set([...selection, ...range])], anchor: path });
  },

  selectAll: () => set({ selection: get().entries.map((e) => e.path) }),

  invertSelection: () => {
    const selected = new Set(get().selection);
    set({ selection: get().entries.filter((e) => !selected.has(e.path)).map((e) => e.path) });
  },

  clearSelection: () => set({ selection: [], anchor: null }),

  setClipboard: (mode, paths) => set({ clipboard: { mode, paths: [...paths] } }),
  clearClipboard: () => set({ clipboard: null }),

  startInlineRename: (path) => set({ renamingPath: path, selection: [path], anchor: path }),
  endInlineRename: () => {
    if (get().renamingPath !== null) set({ renamingPath: null });
  },
}));
