import { useEffect, useLayoutEffect, useRef, useState, type JSX } from 'react';
import { Icon, type IconName } from './Icons';

export interface MenuItem {
  id: string;
  label: string;
  icon?: IconName;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  checked?: boolean;
  separatorBefore?: boolean;
  onClick?: () => void;
}

export interface MenuProps {
  items: MenuItem[];
  x: number;
  y: number;
  onClose: () => void;
}

/**
 * 通用弹出菜单：右键菜单与命令栏下拉共用。
 * 位置会被钳制在视口内，避免在窗口边缘弹出时半个菜单跑到屏幕外。
 */
export function Menu({ items, x, y, onClose }: MenuProps): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const left = Math.min(x, window.innerWidth - rect.width - 8);
    const top = Math.min(y, window.innerHeight - rect.height - 8);
    setPos({ left: Math.max(8, left), top: Math.max(8, top) });
  }, [x, y]);

  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    // 捕获阶段，保证比其它点击处理器先执行
    window.addEventListener('mousedown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [onClose]);

  return (
    <div className="menu" ref={ref} style={{ left: pos.left, top: pos.top }} role="menu">
      {items.map((item) => (
        <div key={item.id} className="menu__group">
          {item.separatorBefore && <div className="menu__separator" />}
          <button
            type="button"
            role="menuitem"
            className={`menu__item${item.disabled ? ' is-disabled' : ''}${item.danger ? ' is-danger' : ''}`}
            disabled={item.disabled}
            onClick={() => {
              item.onClick?.();
              onClose();
            }}
          >
            <span className="menu__icon">{item.icon ? <Icon name={item.icon} size={16} /> : null}</span>
            <span className="menu__label">{item.label}</span>
            {item.shortcut && <span className="menu__shortcut">{item.shortcut}</span>}
            {item.checked && (
              <span className="menu__check">
                <Icon name="check" size={14} />
              </span>
            )}
          </button>
        </div>
      ))}
    </div>
  );
}

export interface ContextMenuState {
  x: number;
  y: number;
  items: MenuItem[];
}

/** 统一的右键菜单管理：任意组件都能拿到 open 方法 */
export function useContextMenu() {
  const [state, setState] = useState<ContextMenuState | null>(null);

  const open = (e: { clientX: number; clientY: number; preventDefault: () => void }, items: MenuItem[]): void => {
    e.preventDefault();
    setState({ x: e.clientX, y: e.clientY, items });
  };

  const close = (): void => setState(null);

  return { state, open, close };
}
