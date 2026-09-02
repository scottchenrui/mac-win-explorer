import { fail } from '../shared/errors';
import type { ApiHandlers } from '../shared/api-contract';
import type {
  ConflictAction,
  ConflictPolicy,
  GuardVerdict,
  QuickItem,
  SortKey,
  SortSpec,
  TransferOp,
} from '../shared/types';
import type { CoreContext } from './context';
import { statEntry } from './entries';
import { createFile, createFolder, renameEntry, trashPaths } from './mutate';
import { getProperties } from './properties';
import { listDirectory } from './list';
import { listVolumes } from './volumes';
import { existsBatch } from './walk';
import {
  MAX_BATCH_PATHS,
  assertNotNested,
  assertWritable,
  classifyPath,
  normalizeName,
  normalizePath,
} from './path-guard';

// ------------------------------ 入参校验 ------------------------------

function asObject(raw: unknown): Record<string, unknown> {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    fail('INVALID_ARG', '请求参数无效');
  }
  return raw as Record<string, unknown>;
}

function asString(raw: unknown, label: string): string {
  if (typeof raw !== 'string') fail('INVALID_ARG', `${label}无效`);
  return raw as string;
}

function asBoolean(raw: unknown, fallback: boolean): boolean {
  if (raw === undefined || raw === null) return fallback;
  if (typeof raw !== 'boolean') fail('INVALID_ARG', '参数类型无效');
  return raw as boolean;
}

function asStringArray(raw: unknown, label: string, max: number): string[] {
  if (!Array.isArray(raw)) fail('INVALID_ARG', `${label}无效`);
  const list = raw as unknown[];
  if (list.length === 0) fail('INVALID_ARG', `请至少提供一个${label}`);
  if (list.length > max) fail('INVALID_ARG', `一次最多处理 ${max} 个项目`);
  return list.map((item) => asString(item, label));
}

const SORT_KEYS: SortKey[] = ['name', 'mtime', 'type', 'size'];

function asSort(raw: unknown): SortSpec {
  if (raw === undefined || raw === null) return { key: 'name', dir: 'asc' };
  const r = asObject(raw);
  const key = SORT_KEYS.includes(r.key as SortKey) ? (r.key as SortKey) : 'name';
  return { key, dir: r.dir === 'desc' ? 'desc' : 'asc' };
}

function asConflictPolicy(raw: unknown): ConflictPolicy {
  const allowed: ConflictPolicy[] = ['replace', 'skip', 'keepBoth', 'ask'];
  return allowed.includes(raw as ConflictPolicy) ? (raw as ConflictPolicy) : 'ask';
}

function asConflictAction(raw: unknown): ConflictAction {
  const allowed: ConflictAction[] = ['replace', 'skip', 'keepBoth', 'retry', 'cancel'];
  return allowed.includes(raw as ConflictAction) ? (raw as ConflictAction) : 'cancel';
}

function asTransferOp(raw: unknown): TransferOp {
  return raw === 'move' ? 'move' : 'copy';
}

/** 左侧"快速访问"列表。目录名跟随 macOS 中文环境的叫法 */
function buildQuickItems(ctx: CoreContext): QuickItem[] {
  const dirs = ctx.host.specialDirs();
  const defs: Array<{ id: string; name: string; path: string; iconId: QuickItem['iconId'] }> = [
    { id: 'home', name: '主目录', path: dirs.home, iconId: 'home' },
    { id: 'desktop', name: '桌面', path: dirs.desktop, iconId: 'desktop' },
    { id: 'documents', name: '文稿', path: dirs.documents, iconId: 'documents' },
    { id: 'downloads', name: '下载', path: dirs.downloads, iconId: 'downloads' },
    { id: 'pictures', name: '图片', path: dirs.pictures, iconId: 'pictures' },
    { id: 'music', name: '音乐', path: dirs.music, iconId: 'music' },
    { id: 'videos', name: '影片', path: dirs.videos, iconId: 'videos' },
    { id: 'applications', name: '应用程序', path: dirs.applications, iconId: 'applications' },
  ];
  return defs.filter((d) => Boolean(d.path));
}

// ------------------------------ 方法实现 ------------------------------

export const handlers: ApiHandlers<CoreContext> = {
  capabilities: {
    validate: () => undefined,
    exec: async (_req, ctx) => ({
      platform: ctx.host.platform,
      arch: process.arch,
      nativeOps: ctx.host.nativeOps,
      appVersion: ctx.appVersion,
      homePath: ctx.homePath,
      modLabel: ctx.host.modLabel,
    }),
  },

  getRoots: {
    validate: () => undefined,
    exec: async (_req, ctx) => ({
      quick: buildQuickItems(ctx),
      volumes: await listVolumes(ctx.host.platform),
    }),
  },

  listDir: {
    validate: (raw) => {
      const r = asObject(raw);
      return {
        path: asString(r.path, '路径'),
        sort: asSort(r.sort),
        showHidden: asBoolean(r.showHidden, false),
      };
    },
    exec: (req) => listDirectory(req.path, req.sort, req.showHidden),
  },

  statOne: {
    validate: (raw) => ({ path: normalizePath(asObject(raw).path, '路径') }),
    exec: (req) => statEntry(req.path),
  },

  getProperties: {
    validate: (raw) => ({ path: normalizePath(asObject(raw).path, '路径') }),
    exec: (req) => getProperties(req.path),
  },

  checkGuard: {
    validate: (raw) => ({
      paths: asStringArray(asObject(raw).paths, '路径', MAX_BATCH_PATHS).map((p) =>
        normalizePath(p, '路径'),
      ),
    }),
    exec: async (req, ctx) => {
      const verdicts: Record<string, GuardVerdict> = {};
      for (const target of req.paths) {
        verdicts[target] = classifyPath(target, ctx.homePath);
      }
      return { verdicts };
    },
  },

  createFolder: {
    validate: (raw) => {
      const r = asObject(raw);
      return {
        parent: normalizePath(r.parent, '目标位置'),
        name: normalizeName(r.name, '文件夹名称'),
      };
    },
    exec: (req, ctx) => createFolder(ctx, req.parent, req.name),
  },

  createFile: {
    validate: (raw) => {
      const r = asObject(raw);
      return {
        parent: normalizePath(r.parent, '目标位置'),
        name: normalizeName(r.name, '文件名称'),
      };
    },
    exec: (req, ctx) => createFile(ctx, req.parent, req.name),
  },

  rename: {
    validate: (raw) => {
      const r = asObject(raw);
      return {
        path: normalizePath(r.path, '路径'),
        newName: normalizeName(r.newName, '新名称'),
      };
    },
    exec: (req, ctx) => renameEntry(ctx, req.path, req.newName),
  },

  trash: {
    validate: (raw) => {
      const r = asObject(raw);
      return {
        paths: asStringArray(r.paths, '路径', MAX_BATCH_PATHS).map((p) => normalizePath(p, '路径')),
        permanentFallback: asBoolean(r.permanentFallback, false),
      };
    },
    exec: (req, ctx) => trashPaths(ctx, req.paths, req.permanentFallback),
  },

  paste: {
    validate: (raw) => {
      const r = asObject(raw);
      return {
        opId: asString(r.opId, '操作 ID'),
        op: asTransferOp(r.op),
        sources: asStringArray(r.sources, '源路径', MAX_BATCH_PATHS).map((p) =>
          normalizePath(p, '源路径'),
        ),
        destDir: normalizePath(r.destDir, '目标位置'),
        conflict: asConflictPolicy(r.conflict),
      };
    },
    exec: async (req, ctx) => {
      // 安全校验放在这里而不是 validate：它依赖 ctx.homePath
      assertNotNested(req.sources, req.destDir);
      assertWritable([req.destDir], ctx.homePath);
      ctx.transfer.start({
        opId: req.opId,
        op: req.op,
        sources: req.sources,
        destDir: req.destDir,
        conflict: req.conflict,
      });
      return { opId: req.opId };
    },
  },

  resolveConflict: {
    validate: (raw) => {
      const r = asObject(raw);
      return {
        opId: asString(r.opId, '操作 ID'),
        action: asConflictAction(r.action),
        applyToAll: asBoolean(r.applyToAll, false),
      };
    },
    exec: async (req, ctx) => ({
      accepted: ctx.transfer.resolveConflict(req.opId, req.action, req.applyToAll),
    }),
  },

  cancelTransfer: {
    validate: (raw) => ({ opId: asString(asObject(raw).opId, '操作 ID') }),
    exec: async (req, ctx) => ({ accepted: ctx.transfer.cancel(req.opId) }),
  },

  copyPathsToClipboard: {
    validate: (raw) => ({
      paths: asStringArray(asObject(raw).paths, '路径', MAX_BATCH_PATHS).map((p) =>
        normalizePath(p, '路径'),
      ),
    }),
    exec: async (req, ctx) => {
      ctx.host.writeClipboard(req.paths.join('\n'));
      return { count: req.paths.length };
    },
  },

  openItem: {
    validate: (raw) => ({ path: normalizePath(asObject(raw).path, '路径') }),
    exec: async (req, ctx) => {
      const error = await ctx.host.open(req.path);
      return error ? { error } : {};
    },
  },

  revealItem: {
    validate: (raw) => ({ path: normalizePath(asObject(raw).path, '路径') }),
    exec: async (req, ctx) => {
      await ctx.host.reveal(req.path);
      return { ok: true };
    },
  },

  getIcons: {
    validate: (raw) => ({
      paths: asStringArray(asObject(raw).paths, '路径', MAX_BATCH_PATHS).map((p) =>
        normalizePath(p, '路径'),
      ),
    }),
    exec: (req, ctx) => ctx.host.icons(req.paths),
  },

  existsBatch: {
    validate: (raw) => ({
      paths: asStringArray(asObject(raw).paths, '路径', MAX_BATCH_PATHS).map((p) =>
        normalizePath(p, '路径'),
      ),
    }),
    exec: (req) => existsBatch(req.paths),
  },

  watchStart: {
    validate: (raw) => ({ path: normalizePath(asObject(raw).path, '目录路径') }),
    exec: async (req, ctx) => ({ watching: ctx.watcher.watch(req.path) }),
  },

  watchStop: {
    validate: (raw) => ({ path: normalizePath(asObject(raw).path, '目录路径') }),
    exec: async (req, ctx) => {
      ctx.watcher.unwatch(req.path);
      return { watching: false };
    },
  },
};
