import fsp from 'node:fs/promises';
import path from 'node:path';
import { ApiFailure } from '../shared/errors';
import type {
  ConflictAction,
  ConflictItem,
  ConflictPolicy,
  TransferOp,
  TransferProgress,
} from '../shared/types';
import type { CoreContext } from './context';
import { fromNodeError } from './errors-node';
import { detectTopLevelConflicts, existingNames, pathExists, uniqueDestPath, uniqueTargetName } from './conflicts';
import { RateMeter } from './progress';
import { walkTree, type WalkResult } from './walk';
import { mapLimit } from './utils';

const BIG_FILE_THRESHOLD = 8 * 1024 * 1024;
const BIG_FILE_CONCURRENCY = 2;
const SMALL_FILE_CONCURRENCY = 16;

export interface StartTransferRequest {
  opId: string;
  op: TransferOp;
  sources: string[];
  destDir: string;
  conflict: ConflictPolicy;
}

interface Plan {
  source: string;
  name: string;
  destRoot: string;
}

interface Task {
  req: StartTransferRequest;
  controller: AbortController;
  /** 用户勾选"应用于全部"后的统一决策 */
  applyToAll: ConflictAction | null;
  waiter: { resolve: (action: ConflictAction) => void } | null;
  startedAt: number;
}

function isAborted(task: Task): boolean {
  return task.controller.signal.aborted;
}

/**
 * 复制/移动引擎。
 *
 * 三条设计原则：
 * 1. 移动优先用 rename（同卷零拷贝、原子），跨卷（EXDEV）才降级为"复制 + 删源"；
 * 2. 目录树先建好再拷文件，保证顺序确定；大小文件分池并发，避免大文件把带宽吃满；
 * 3. 删除源文件前再检查一次取消标记，避免中途取消造成数据丢失。
 */
export class TransferManager {
  private readonly tasks = new Map<string, Task>();

  constructor(private readonly ctx: CoreContext) {}

  /** 立即返回，进度通过 ProgressBus 推送 */
  start(req: StartTransferRequest): void {
    const task: Task = {
      req,
      controller: new AbortController(),
      applyToAll: null,
      waiter: null,
      startedAt: Date.now(),
    };
    this.tasks.set(req.opId, task);
    void this.run(task).catch(() => {
      // 错误已在 run 内部通过 progress 事件上报
    });
  }

  resolveConflict(opId: string, action: ConflictAction, applyToAll: boolean): boolean {
    const task = this.tasks.get(opId);
    if (!task || !task.waiter) return false;
    if (applyToAll) task.applyToAll = action;
    const waiter = task.waiter;
    task.waiter = null;
    waiter.resolve(action);
    return true;
  }

  cancel(opId: string): boolean {
    const task = this.tasks.get(opId);
    if (!task) return false;
    task.controller.abort();
    if (task.waiter) {
      const waiter = task.waiter;
      task.waiter = null;
      waiter.resolve('cancel');
    }
    return true;
  }

  private async run(task: Task): Promise<void> {
    const { opId, op, sources, destDir, conflict } = task.req;
    const meter = new RateMeter();
    const startedAt = task.startedAt;

    let totalFiles = 0;
    let totalBytes = 0;
    let processedFiles = 0;
    let processedBytes = 0;

    const emit = (patch: Partial<TransferProgress>): void => {
      const percent =
        totalBytes > 0
          ? Math.min(1, processedBytes / totalBytes)
          : totalFiles > 0
            ? Math.min(1, processedFiles / totalFiles)
            : 0;
      this.ctx.progress.emit({
        opId,
        op,
        destDir,
        phase: 'transfer',
        processedFiles,
        totalFiles,
        processedBytes,
        totalBytes,
        currentFile: '',
        percent,
        startedAt,
        ...patch,
      });
    };

    try {
      // ---------- 1. 扫描 ----------
      emit({ phase: 'scan', currentFile: '正在计算项目数量…' });
      const scans = new Map<string, WalkResult>();
      for (const source of sources) {
        if (isAborted(task)) throw new ApiFailure({ code: 'CANCELLED', message: '操作已取消' });
        let st;
        try {
          st = await fsp.lstat(source);
        } catch (e) {
          throw new ApiFailure(fromNodeError(e, source));
        }
        if (st.isDirectory()) {
          const result = await walkTree([source]);
          scans.set(source, result);
          totalFiles += result.files.length;
          totalBytes += result.totalBytes;
        } else {
          const single: WalkResult = {
            files: [{ path: source, size: st.size, rel: '' }],
            dirs: [],
            totalBytes: st.size,
            truncated: false,
          };
          scans.set(source, single);
          totalFiles += 1;
          totalBytes += st.size;
        }
      }

      // ---------- 2. 顶层冲突决策 ----------
      const taken = await existingNames(destDir);
      const plans: Plan[] = [];
      const conflicts = await detectTopLevelConflicts(sources, destDir);

      for (const source of sources) {
        const name = path.basename(source);
        const hasConflict = conflicts.some((c) => c.sourcePath === source);
        if (!hasConflict) {
          taken.add(name.toLowerCase());
          plans.push({ source, name, destRoot: path.join(destDir, name) });
          continue;
        }

        // ask 需要挂起等 UI 决策，其余策略直接采用
        const policy: ConflictAction =
          conflict === 'ask' ? await this.askUser(task, conflicts, emit) : conflict;

        if (policy === 'skip') continue;
        if (policy === 'cancel') throw new ApiFailure({ code: 'CANCELLED', message: '操作已取消' });
        if (policy === 'keepBoth') {
          const unique = uniqueTargetName(name, taken);
          taken.add(unique.toLowerCase());
          plans.push({ source, name, destRoot: path.join(destDir, unique) });
          continue;
        }
        // replace（retry 也按替换处理：重新写入即为重试）
        plans.push({ source, name, destRoot: path.join(destDir, name) });
      }

      // ---------- 3. 传输 ----------
      const innerPolicy: ConflictAction = task.applyToAll ?? (conflict === 'ask' ? 'keepBoth' : conflict);
      emit({ phase: 'transfer' });

      for (const plan of plans) {
        if (isAborted(task)) throw new ApiFailure({ code: 'CANCELLED', message: '操作已取消' });
        const scan = scans.get(plan.source);
        if (!scan) continue;

        await this.transferOne(plan, scan, op, innerPolicy, task, (files, bytes, current) => {
          processedFiles += files;
          processedBytes += bytes;
          emit({
            phase: 'transfer',
            currentFile: current,
            bytesPerSecond: meter.sample(processedBytes),
            etaSeconds: meter.eta(processedBytes, totalBytes),
          });
        });
      }

      emit({ phase: 'done', percent: 1, currentFile: '', processedFiles: totalFiles });
    } catch (e) {
      const appError = e instanceof ApiFailure ? e.appError : fromNodeError(e);
      if (appError.code === 'CANCELLED') {
        emit({ phase: 'cancelled', currentFile: '', error: appError });
      } else {
        emit({ phase: 'error', currentFile: '', error: appError });
      }
    } finally {
      this.tasks.delete(opId);
    }
  }

  /** 挂起等待 UI 决策；用户勾选"应用于全部"后不再重复询问 */
  private askUser(
    task: Task,
    conflicts: ConflictItem[],
    emit: (patch: Partial<TransferProgress>) => void,
  ): Promise<ConflictAction> {
    if (task.applyToAll) return Promise.resolve(task.applyToAll);

    emit({ phase: 'conflict', conflicts, currentFile: '' });
    return new Promise<ConflictAction>((resolve) => {
      task.waiter = { resolve };
    });
  }

  private async transferOne(
    plan: Plan,
    scan: WalkResult,
    op: TransferOp,
    policy: ConflictAction,
    task: Task,
    onProgress: (files: number, bytes: number, current: string) => void,
  ): Promise<void> {
    const destExists = await pathExists(plan.destRoot);
    const sourceIsDir = scan.dirs.length > 0;

    // 快路径：目标不存在时的同卷移动
    if (op === 'move' && !destExists) {
      try {
        await fsp.rename(plan.source, plan.destRoot);
        onProgress(scan.files.length || 1, scan.totalBytes, plan.name);
        return;
      } catch (e) {
        const code = (e as NodeJS.ErrnoException).code;
        // EXDEV 跨卷、EPERM/EACCES 权限受限 → 降级为复制后删除
        if (code !== 'EXDEV' && code !== 'EPERM' && code !== 'EACCES' && code !== 'ENOTEMPTY') {
          throw new ApiFailure(fromNodeError(e, plan.source));
        }
      }
    }

    if (destExists) {
      if (policy === 'skip') return;
      if (policy === 'replace') {
        await fsp.rm(plan.destRoot, { recursive: true, force: true });
      } else if (policy === 'keepBoth') {
        // keepBoth 的目标名在计划阶段已经处理过，这里兜底
        plan.destRoot = await uniqueDestPath(plan.destRoot);
      }
    }

    // 先建目录树，保证后续文件复制的父目录一定存在
    if (sourceIsDir) {
      for (const d of scan.dirs) {
        const target = d.rel ? path.join(plan.destRoot, d.rel) : plan.destRoot;
        await fsp.mkdir(target, { recursive: true });
      }
    }

    const bigFiles = scan.files.filter((f) => f.size >= BIG_FILE_THRESHOLD);
    const smallFiles = scan.files.filter((f) => f.size < BIG_FILE_THRESHOLD);

    const copyOne = async (item: { path: string; size: number; rel: string }): Promise<void> => {
      if (isAborted(task)) return;
      const target = item.rel ? path.join(plan.destRoot, item.rel) : plan.destRoot;
      const copied = await this.copyFileOrLink(item.path, target, policy, task);
      if (copied) onProgress(1, item.size, item.path);
    };

    await mapLimit(bigFiles, BIG_FILE_CONCURRENCY, copyOne);
    await mapLimit(smallFiles, SMALL_FILE_CONCURRENCY, copyOne);

    if (op === 'move') {
      // 删除源之前最后确认一次，避免取消时丢数据
      if (isAborted(task)) throw new ApiFailure({ code: 'CANCELLED', message: '操作已取消' });
      await fsp.rm(plan.source, { recursive: true, force: true });
    }
  }

  /** 返回是否真的写入了（skip 时返回 false） */
  private async copyFileOrLink(
    source: string,
    dest: string,
    policy: ConflictAction,
    task: Task,
  ): Promise<boolean> {
    if (isAborted(task)) return false;

    let lstat;
    try {
      lstat = await fsp.lstat(source);
    } catch (e) {
      throw new ApiFailure(fromNodeError(e, source));
    }

    let finalDest = dest;
    if (await pathExists(dest)) {
      if (policy === 'skip') return false;
      if (policy === 'replace') {
        await fsp.rm(dest, { recursive: true, force: true });
      } else {
        finalDest = await uniqueDestPath(dest);
      }
    }

    if (lstat.isSymbolicLink()) {
      const linkTarget = await fsp.readlink(source);
      await fsp.symlink(linkTarget, finalDest);
      return true;
    }

    await fsp.copyFile(source, finalDest);
    try {
      await fsp.chmod(finalDest, lstat.mode & 0o777);
      await fsp.utimes(finalDest, lstat.atime, lstat.mtime);
    } catch {
      // 时间与权限恢复失败不影响复制结果
    }
    return true;
  }
}
