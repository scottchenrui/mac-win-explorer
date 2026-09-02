import { useEffect, useState, type JSX, type RefObject } from 'react';
import { Icon } from './Icons';
import { useAppStore } from '../store/appStore';
import type { VolumeInfo } from '@shared/types';

interface Segment {
  name: string;
  path: string;
}

function buildSegments(path: string, volumes: VolumeInfo[]): Segment[] {
  const parts = path.split('/').filter(Boolean);
  const root = volumes.find((v) => v.path === '/');
  const segments: Segment[] = [{ name: root?.name ?? 'Macintosh HD', path: '/' }];

  let acc = '';
  for (const part of parts) {
    acc += `/${part}`;
    segments.push({ name: part, path: acc });
  }
  return segments;
}

export interface AddressBarProps {
  inputRef: RefObject<HTMLInputElement | null>;
}

/**
 * 地址栏：面包屑 + 可编辑路径（点空白处或 ⌘L 切到输入框）。
 */
export function AddressBar({ inputRef }: AddressBarProps): JSX.Element {
  const path = useAppStore((s) => s.path);
  const volumes = useAppStore((s) => s.volumes);
  const navigate = useAppStore((s) => s.navigate);
  const back = useAppStore((s) => s.back);
  const forward = useAppStore((s) => s.forward);
  const up = useAppStore((s) => s.up);
  const canBack = useAppStore((s) => s.historyIndex > 0);
  const canForward = useAppStore((s) => s.historyIndex < s.history.length - 1);
  const filter = useAppStore((s) => s.filter);
  const setFilter = useAppStore((s) => s.setFilter);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(path);

  useEffect(() => setDraft(path), [path]);

  const startEdit = (): void => {
    setDraft(path);
    setEditing(true);
    // 等输入框渲染出来再聚焦
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  };

  const commit = (): void => {
    setEditing(false);
    const target = draft.trim();
    if (target && target !== path) void navigate(target);
  };

  const segments = buildSegments(path, volumes);

  return (
    <div className="addrbar">
      <button type="button" className="addrbar__nav" disabled={!canBack} onClick={() => void back()} title="后退 (Alt+←)">
        <Icon name="back" size={16} />
      </button>
      <button type="button" className="addrbar__nav" disabled={!canForward} onClick={() => void forward()} title="前进 (Alt+→)">
        <Icon name="forward" size={16} />
      </button>
      <button type="button" className="addrbar__nav" onClick={() => void up()} title="上一级 (Alt+↑)">
        <Icon name="up" size={16} />
      </button>

      <div className="addrbar__path" onMouseDown={(e) => {
        // 点空白处（不是面包屑按钮、也不是输入框）才切到编辑态
        if (!editing && e.target === e.currentTarget) startEdit();
      }}>
        {editing ? (
          <input
            ref={inputRef}
            className="addrbar__input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              else if (e.key === 'Escape') {
                setEditing(false);
                setDraft(path);
              }
            }}
            spellCheck={false}
          />
        ) : (
          <div className="addrbar__crumbs">
            {segments.map((seg, i) => (
              <span key={seg.path} className="addrbar__crumbwrap">
                {i > 0 && <Icon name="chevronRight" size={12} className="addrbar__sep" />}
                <button
                  type="button"
                  className={`addrbar__crumb${i === segments.length - 1 ? ' is-current' : ''}`}
                  onClick={() => void navigate(seg.path)}
                >
                  {seg.name}
                </button>
              </span>
            ))}
            <button type="button" className="addrbar__blank" onClick={startEdit} aria-label="编辑路径" />
          </div>
        )}
      </div>

      <div className="addrbar__search">
        <Icon name="search" size={14} />
        <input
          className="addrbar__searchinput"
          placeholder="搜索当前文件夹"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          spellCheck={false}
        />
        {filter && (
          <button type="button" className="addrbar__clear" onClick={() => setFilter('')} title="清除">
            <Icon name="close" size={12} />
          </button>
        )}
      </div>
    </div>
  );
}
