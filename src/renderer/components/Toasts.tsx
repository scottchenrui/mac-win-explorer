import type { JSX } from 'react';
import { Icon, type IconName } from './Icons';
import { useToastStore } from '../store/toastStore';

const ICONS: Record<string, IconName> = {
  info: 'info',
  success: 'check',
  error: 'warning',
};

export function Toasts(): JSX.Element {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div className="toasts">
      {toasts.map((item) => (
        <div key={item.id} className={`toast toast--${item.kind}`} onClick={() => dismiss(item.id)}>
          <span className="toast__icon">
            <Icon name={ICONS[item.kind] ?? 'info'} size={16} />
          </span>
          <span className="toast__text">{item.message}</span>
        </div>
      ))}
    </div>
  );
}
