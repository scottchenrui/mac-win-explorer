import fsp from 'node:fs/promises';
import path from 'node:path';
import { constants } from 'node:fs';
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
  policy: ConflictAction;
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
          const result = await walkTree([source], { strict: true, signal: task.controller.signal });
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
          plans.push({ source, name, destRoot: path.join(destDir, name), policy: conflict === 'ask' ? 'keepBoth' : conflict });
          continue;
        }

        // ask 需要挂起等 UI 决策，其余策略直接采用
        const policy: ConflictAction =
          conflict === 'ask' ? await this.askUser(task, conflicts.filter((item) => item.sourcePath === source), emit) : conflict;

        if (policy === 'skip') continue;
        if (policy === 'cancel') throw new ApiFailure({ code: 'CANCELLED', message: '操作已取消' });
        if (policy === 'keepBoth') {
          const unique = uniqueTargetName(name, taken);
          taken.add(unique.toLowerCase());
          plans.push({ source, name, destRoot: path.join(destDir, unique), policy });
          continue;
        }
        // replace（retry 也按替换处理：重新写入即为重试）
        plans.push({ source, name, destRoot: path.join(destDir, name), policy: 'replace' });
      }

      // ---------- 3. 传输 ----------
      emit({ phase: 'transfer' });

      for (const plan of plans) {
        if (isAborted(task)) throw new ApiFailure({ code: 'CANCELLED', message: '操作已取消' });
        const scan = scans.get(plan.source);
        if (!scan) continue;

        await this.transferOne(plan, scan, op, plan.policy, task, (files, bytes, current) => {
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

    if (isAborted(task)) return Promise.resolve('cancel');
    return new Promise<ConflictAction>((resolve) => {
      task.waiter = { resolve };
      emit({ phase: 'conflict', conflicts, currentFile: '' });
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
    if (scan.truncated) throw new ApiFailure({ code: 'EINVAL', message: '扫描不完整，操作已停止' });
    if (destExists && policy !== 'keepBoth' && policy !== 'skip') {
      const [sourceStat, destStat] = await Promise.all([fsp.lstat(plan.source), fsp.lstat(plan.destRoot)]);
      if (sourceStat.dev === destStat.dev && sourceStat.ino === destStat.ino) {
        throw new ApiFailure({ code: 'SAME_PATH', message: '不能替换源文件自身' });
      }
    }

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

    if (destExists && policy === 'skip') return;
    if (destExists && policy === 'keepBoth') plan.destRoot = await uniqueDestPath(plan.destRoot);
    if (path.resolve(plan.source) === path.resolve(plan.destRoot)) {
      throw new ApiFailure({ code: 'SAME_PATH', message: '不能替换源文件自身' });
    }

    // 在目标卷内暂存，完整复制后再提交；旧目标在提交成功之前保留。
    const staging = await fsp.mkdtemp(path.join(path.dirname(plan.destRoot), '.explorer-transfer-'));
    const payload = path.join(staging, 'payload');
    const backup = path.join(staging, 'previous');
    let preserveBackup = false;
    const checkCancelled = (): void => {
      if (isAborted(task)) throw new ApiFailure({ code: 'CANCELLED', message: '操作已取消' });
    };
    try {
      if (sourceIsDir) {
        for (const d of scan.dirs) {
          checkCancelled();
          await fsp.mkdir(d.rel ? path.join(payload, d.rel) : payload, { recursive: true });
        }
      }
      const snapshots = new Map<string, Awaited<ReturnType<typeof fsp.lstat>>>();
      const copyOne = async (item: { path: string; size: number; rel: string }): Promise<void> => {
        checkCancelled();
        snapshots.set(item.path, await fsp.lstat(item.path));
        await this.copyFileOrLink(item.path, item.rel ? path.join(payload, item.rel) : payload);
        onProgress(1, item.size, item.path);
      };
      // 等所有已启动的 worker 结束，才能清理暂存目录。
      await mapLimit(scan.files.filter((f) => f.size >= BIG_FILE_THRESHOLD), BIG_FILE_CONCURRENCY, copyOne);
      await mapLimit(scan.files.filter((f) => f.size < BIG_FILE_THRESHOLD), SMALL_FILE_CONCURRENCY, copyOne);
      checkCancelled();

      if (await pathExists(plan.destRoot)) {
        if (policy === 'skip') return;
        if (policy === 'keepBoth') plan.destRoot = await uniqueDestPath(plan.destRoot);
        else {
          await fsp.rename(plan.destRoot, backup);
          preserveBackup = true;
        }
      }
      try {
        await fsp.rename(payload, plan.destRoot);
      } catch (error) {
        if (preserveBackup) {
          try {
            await fsp.rename(backup, plan.destRoot);
            preserveBackup = false;
          } catch {
            throw new ApiFailure({ code: 'UNKNOWN', message: `替换失败，原目标保留在：${backup}`, path: backup });
          }
        }
        throw error;
      }
      preserveBackup = false;
      if (op === 'move') {
        checkCancelled();
        for (const [source, before] of snapshots) {
          const after = await fsp.lstat(source);
          if (before.ino !== after.ino || before.dev !== after.dev || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) {
            throw new ApiFailure({ code: 'CONFLICT', message: '源文件在复制期间发生变化，已保留源文件', path: source });
          }
        }
        // 只删除扫描并成功复制的文件；新出现的文件会使 rmdir 失败并保留下来。
        for (const item of scan.files) {
          checkCancelled();
          await fsp.unlink(item.path);
        }
        for (const dir of [...scan.dirs].reverse()) {
          checkCancelled();
          await fsp.rmdir(dir.path);
        }
      }
    } finally {
      if (!preserveBackup) await fsp.rm(staging, { recursive: true, force: true });
    }
  }

  private async copyFileOrLink(source: string, dest: string): Promise<void> {
    const stat = await fsp.lstat(source);
    if (stat.isSymbolicLink()) {
      await fsp.symlink(await fsp.readlink(source), dest);
      return;
    }
    if (!stat.isFile()) throw new ApiFailure({ code: 'UNSUPPORTED', message: '源文件类型已变化', path: source });
    await fsp.copyFile(source, dest, constants.COPYFILE_EXCL);
    try {
      await fsp.chmod(dest, stat.mode & 0o777);
      await fsp.utimes(dest, stat.atime, stat.mtime);
    } catch {
      // 时间与权限恢复失败不影响复制内容。
    }
  }
}
