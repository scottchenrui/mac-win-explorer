import type { JSX } from 'react';
import { useAppStore } from '../store/appStore';

/**
 * 自绘标题栏。
 *
 * macOS 用 hiddenInset 窗口样式时，系统红绿灯仍由系统绘制在左上角，
 * 所以这里左侧要留出约 78px 空白，右侧放应用标题。整个区域可拖拽窗口。
 */
export function TitleBar(): JSX.Element {
  const path = useAppStore((s) => s.path);
  const volumes = useAppStore((s) => s.volumes);

  const segments = path.split('/').filter(Boolean);
  const folderName = segments.length > 0 ? segments[segments.length - 1] : (volumes[0]?.name ?? '此电脑');

  return (
    <div className="titlebar">
      <div className="titlebar__lights" aria-hidden="true" />
      <div className="titlebar__title">
        {folderName}
        <span className="titlebar__app"> — 文件资源管理器</span>
      </div>
    </div>
  );
}
