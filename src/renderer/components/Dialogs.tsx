import { useEffect, useRef, useState, type JSX } from 'react';
import { formatBytes, formatExactBytes, formatFullDateTime, iconCategoryFor } from '@shared/format';
import type { FsEntry, PropertiesInfo } from '@shared/types';
import { Icon } from './Icons';
import { useDialogStore } from '../store/dialogStore';
import { useFileActions } from '../hooks/useFileActions';
import { api } from '../api';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
  width?: number;
}

function Modal({ title, onClose, children, footer, width = 460 }: ModalProps): JSX.Element {
  return (
    <div className="modal__backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width }} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal__head">
          <span className="modal__title">{title}</span>
          <button type="button" className="modal__close" onClick={onClose} aria-label="关闭">
            <Icon name="close" size={14} />
          </button>
        </div>
        <div className="modal__body">{children}</div>
        <div className="modal__foot">{footer}</div>
      </div>
    </div>
  );
}

/** 新建/重命名：自动选中文件名主体，扩展名不选中（与 Windows 一致） */
function NameDialog({
  title,
  initial,
  placeholder,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  title: string;
  initial: string;
  placeholder: string;
  confirmLabel: string;
  onConfirm: (name: string) => Promise<boolean>;
  onClose: () => void;
}): JSX.Element {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    const dot = el.value.lastIndexOf('.');
    if (dot > 0) el.setSelectionRange(0, dot);
    else el.select();
  }, []);

  const submit = async (): Promise<void> => {
    const name = value.trim();
    if (!name) {
      setError('名称不能为空');
      return;
    }
    const success = await onConfirm(name);
    if (!success) setError('操作失败，请检查是否有同名项目或权限');
  };

  return (
    <Modal
      title={title}
      onClose={onClose}
      width={420}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            取消
          </button>
          <button type="button" className="btn btn--primary" onClick={() => void submit()}>
            {confirmLabel}
          </button>
        </>
      }
    >
      <input
        ref={inputRef}
        className="input"
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          setValue(e.target.value);
          setError('');
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void submit();
        }}
        spellCheck={false}
      />
      {error && <p className="formerror">{error}</p>}
    </Modal>
  );
}

function PropertiesDialog({ entry, onClose }: { entry: FsEntry; onClose: () => void }): JSX.Element {
  const [props, setProps] = useState<PropertiesInfo | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await api.getProperties({ path: entry.path });
      if (cancelled) return;
      if (result.ok) setProps(result.data);
      else setError(result.error.message);
    })();
    return () => {
      cancelled = true;
    };
  }, [entry.path]);

  return (
    <Modal
      title={`${entry.name} 属性`}
      onClose={onClose}
      width={420}
      footer={
        <button type="button" className="btn btn--primary" onClick={onClose}>
          确定
        </button>
      }
    >
      <div className="props__head">
        <span className="props__icon">
          <Icon name={iconCategoryFor(entry.kind, entry.isPackage, entry.ext)} size={32} />
        </span>
        <span className="props__name">{entry.name}</span>
      </div>

      {error ? (
        <p className="formerror">{error}</p>
      ) : !props ? (
        <p className="props__loading">正在读取…</p>
      ) : (
        <dl className="props">
          <div className="props__row">
            <dt>类型</dt>
            <dd>{props.entry.typeLabel}</dd>
          </div>
          <div className="props__row">
            <dt>位置</dt>
            <dd className="props__path">{props.location}</dd>
          </div>
          <div className="props__row">
            <dt>大小</dt>
            <dd>
              {formatBytes(props.sizeOnDisk)}（{formatExactBytes(props.sizeOnDisk)}）
            </dd>
          </div>
          {props.contains && (
            <div className="props__row">
              <dt>包含</dt>
              <dd>
                {props.contains.files} 个文件，{props.contains.dirs} 个文件夹
                {props.truncated && '（统计已截断）'}
              </dd>
            </div>
          )}
          <div className="props__row">
            <dt>占用空间</dt>
            <dd>{formatBytes(props.sizeOnDisk)}</dd>
          </div>
          <div className="props__row">
            <dt>创建时间</dt>
            <dd>{formatFullDateTime(props.entry.birthtime)}</dd>
          </div>
          <div className="props__row">
            <dt>修改时间</dt>
            <dd>{formatFullDateTime(props.entry.mtime)}</dd>
          </div>
          <div className="props__row">
            <dt>上次打开时间</dt>
            <dd>{formatFullDateTime(props.entry.atime)}</dd>
          </div>
          <div className="props__row">
            <dt>权限</dt>
            <dd>
              {props.permissions.modeString} ({props.permissions.modeOctal}) · uid {props.permissions.uid} · gid{' '}
              {props.permissions.gid}
            </dd>
          </div>
        </dl>
      )}
    </Modal>
  );
}

function DeleteDialog({
  paths,
  onClose,
}: {
  paths: string[];
  onClose: () => void;
}): JSX.Element {
  const actions = useFileActions();
  const preview = paths.slice(0, 8).map((p) => p.split('/').filter(Boolean).pop() ?? p);

  return (
    <Modal
      title={`移到废纸篓（${paths.length} 个项目）`}
      onClose={onClose}
      width={420}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="btn btn--danger"
            onClick={() => void actions.confirmDelete(false)}
          >
            移到废纸篓
          </button>
        </>
      }
    >
      <p className="dialogtext">确定要将以下项目移到废纸篓吗？</p>
      <ul className="namelist">
        {preview.map((name, i) => (
          <li key={`${name}-${i}`}>{name}</li>
        ))}
        {paths.length > preview.length && <li className="namelist__more">…以及另外 {paths.length - preview.length} 个项目</li>}
      </ul>
    </Modal>
  );
}

function PermanentDeleteDialog({
  paths,
  reason,
  onClose,
}: {
  paths: string[];
  reason: string;
  onClose: () => void;
}): JSX.Element {
  const actions = useFileActions();
  return (
    <Modal
      title="无法移到废纸篓"
      onClose={onClose}
      width={440}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="btn btn--danger"
            onClick={() => void actions.confirmDelete(true)}
          >
            永久删除
          </button>
        </>
      }
    >
      <p className="dialogtext">
        {reason}
        <br />
        如果继续，这 {paths.length} 个项目将被<b>立即永久删除，无法恢复</b>。
      </p>
    </Modal>
  );
}

/** 所有模态对话框的统一出口，由 dialogStore 驱动 */
export function Dialogs(): JSX.Element | null {
  const { dialog, close } = useDialogStore();
  const actions = useFileActions();

  if (dialog.kind === 'none') return null;

  if (dialog.kind === 'newFolder') {
    return (
      <NameDialog
        title="新建文件夹"
        initial="新建文件夹"
        placeholder="文件夹名称"
        confirmLabel="创建"
        onClose={close}
        onConfirm={actions.submitName}
      />
    );
  }

  if (dialog.kind === 'newFile') {
    return (
      <NameDialog
        title="新建文件"
        initial="新建文本文档.txt"
        placeholder="文件名称"
        confirmLabel="创建"
        onClose={close}
        onConfirm={actions.submitName}
      />
    );
  }

  if (dialog.kind === 'delete') {
    return <DeleteDialog paths={dialog.paths} onClose={close} />;
  }

  if (dialog.kind === 'deletePermanent') {
    return <PermanentDeleteDialog paths={dialog.paths} reason={dialog.reason} onClose={close} />;
  }

  if (dialog.kind === 'properties') {
    return <PropertiesDialog entry={dialog.entry} onClose={close} />;
  }

  return null;
}
