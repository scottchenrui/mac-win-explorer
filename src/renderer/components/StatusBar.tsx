import { useEffect, useState, type JSX } from 'react';
import { formatBytes } from '@shared/format';
import { useAppStore } from '../store/appStore';
import { api } from '../api';
import { isElectron } from '../api';

/** 最多统计这么多选中项，避免选中一堆大目录时把界面卡住 */
const MAX_SIZE_LOOKUP = 16;

export function StatusBar(): JSX.Element {
  const entries = useAppStore((s) => s.entries);
  const selection = useAppStore((s) => s.selection);
  const [size, setSize] = useState<number | null>(null);
  const [computing, setComputing] = useState(false);

  useEffect(() => {
    if (selection.length === 0) {
      setSize(null);
      setComputing(false);
      return;
    }
    let cancelled = false;
    setComputing(true);

    void (async () => {
      let total = 0;
      // 并发查询，逐个累加（单线程下 += 不存在竞态）
      await Promise.all(
        selection.slice(0, MAX_SIZE_LOOKUP).map(async (path) => {
          const result = await api.getProperties({ path });
          if (result.ok) total += result.data.sizeOnDisk;
        }),
      );
      if (!cancelled) {
        setSize(total);
        setComputing(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selection]);

  const overflow = selection.length > MAX_SIZE_LOOKUP;

  return (
    <div className="statusbar">
      <span className="statusbar__item">{entries.length} 个项目</span>
      {selection.length > 0 && (
        <span className="statusbar__item statusbar__item--sel">
          选中 {selection.length} 项
          {computing ? '，大小计算中…' : `，${formatBytes(size ?? 0)}`}
          {overflow && '（部分项目未计入）'}
        </span>
      )}
      <span className="statusbar__spacer" />
      <span className="statusbar__item statusbar__item--muted">
        {isElectron ? '桌面版' : '浏览器预览模式（原生能力不可用）'}
      </span>
    </div>
  );
}
