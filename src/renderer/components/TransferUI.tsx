import { useState, type JSX } from 'react';
import { formatBytes, formatDateTime, formatEta, iconCategoryFor } from '@shared/format';
import type { TransferProgress } from '@shared/types';
import { Icon } from './Icons';
import { useTransferStore } from '../store/transferStore';

function ProgressRow({ task, onCancel }: { task: TransferProgress; onCancel: () => void }): JSX.Element {
  const percent = Math.round(task.percent * 100);
  const indeterminate = task.phase === 'scan';

  return (
    <div className="transfer__task">
      <div className="transfer__head">
        <span className="transfer__dest" title={task.destDir}>
          {task.op === 'move' ? '移动到' : '复制到'} {task.destDir}
        </span>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onCancel}>
          取消
        </button>
      </div>

      <div className={`progress${indeterminate ? ' is-indeterminate' : ''}`}>
        <div className="progress__bar" style={{ width: `${percent}%` }} />
      </div>

      <div className="transfer__meta">
        <span>
          {task.totalFiles > 0
            ? `${task.processedFiles} / ${task.totalFiles} 个项目`
            : '正在准备…'}
          {' · '}
          {formatBytes(task.processedBytes)} / {formatBytes(task.totalBytes)}
        </span>
        <span className="transfer__eta">
          {task.bytesPerSecond && task.bytesPerSecond > 0 && ` · ${formatBytes(Math.round(task.bytesPerSecond))}/秒`}
          {' · '}
          {formatEta(task.etaSeconds)}
        </span>
      </div>

      <div className="transfer__file" title={task.currentFile}>
        {task.currentFile || '　'}
      </div>
    </div>
  );
}

function ProgressDialog({ tasks }: { tasks: TransferProgress[] }): JSX.Element {
  const cancel = useTransferStore((s) => s.cancel);
  const moving = tasks.some((t) => t.op === 'move');

  return (
    <div className="modal__backdrop">
      <div className="modal" style={{ width: 520 }} role="dialog" aria-modal="true">
        <div className="modal__head">
          <span className="modal__title">正在{moving ? '移动' : '复制'}项目</span>
        </div>
        <div className="modal__body transfer">
          {tasks.map((task) => (
            <ProgressRow key={task.opId} task={task} onCancel={() => void cancel(task.opId)} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ConflictDialog({ task }: { task: TransferProgress }): JSX.Element {
  const resolve = useTransferStore((s) => s.resolveConflict);
  const cancel = useTransferStore((s) => s.cancel);
  const [applyToAll, setApplyToAll] = useState(false);
  const conflicts = task.conflicts ?? [];

  return (
    <div className="modal__backdrop">
      <div className="modal" style={{ width: 540 }} role="dialog" aria-modal="true">
        <div className="modal__head">
          <span className="modal__title">替换或跳过项目</span>
        </div>
        <div className="modal__body">
          <p className="dialogtext">
            目标文件夹 <b>{task.destDir}</b> 中已存在以下 {conflicts.length} 个项目，请选择处理方式。
          </p>

          <div className="conflictlist">
            {conflicts.slice(0, 6).map((item) => (
              <div key={item.sourcePath} className="conflict">
                <span className="conflict__icon">
                  <Icon
                    name={item.sourceIsDir ? 'folder' : iconCategoryFor('file', false, item.name.slice(item.name.lastIndexOf('.')))}
                    size={28}
                  />
                </span>
                <div className="conflict__body">
                  <div className="conflict__name">{item.name}</div>
                  <div className="conflict__row">
                    <span className="conflict__tag">源</span>
                    <span>{formatBytes(item.sourceSize)}</span>
                    <span>{formatDateTime(item.sourceMtime)}</span>
                  </div>
                  <div className="conflict__row">
                    <span className="conflict__tag">目标</span>
                    <span>{formatBytes(item.destSize)}</span>
                    <span>{formatDateTime(item.destMtime)}</span>
                  </div>
                </div>
              </div>
            ))}
            {conflicts.length > 6 && (
              <div className="conflict__more">…以及另外 {conflicts.length - 6} 个冲突项目</div>
            )}
          </div>

          <label className="checkbox">
            <input
              type="checkbox"
              checked={applyToAll}
              onChange={(e) => setApplyToAll(e.target.checked)}
            />
            <span>对其余 {conflicts.length} 个冲突项目执行相同操作</span>
          </label>
        </div>
        <div className="modal__foot">
          <button type="button" className="btn" onClick={() => void cancel(task.opId)}>
            取消
          </button>
          <button type="button" className="btn" onClick={() => void resolve('skip', applyToAll)}>
            跳过
          </button>
          <button type="button" className="btn" onClick={() => void resolve('keepBoth', applyToAll)}>
            保留两者
          </button>
          <button type="button" className="btn btn--primary" onClick={() => void resolve('replace', applyToAll)}>
            替换目标文件
          </button>
        </div>
      </div>
    </div>
  );
}

/** 传输相关 UI：冲突优先于进度显示（冲突时不显示进度框，避免两个模态叠在一起） */
export function TransferUI(): JSX.Element | null {
  const active = useTransferStore((s) => s.active);
  const conflict = useTransferStore((s) => s.conflict);

  if (conflict) return <ConflictDialog task={conflict} />;
  if (active.length === 0) return null;
  return <ProgressDialog tasks={active} />;
}
