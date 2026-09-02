import type { JSX } from 'react';
import type { IconCategory } from '@shared/format';

export type IconName =
  | IconCategory
  | 'computer'
  | 'home'
  | 'desktop'
  | 'documents'
  | 'downloads'
  | 'pictures'
  | 'music'
  | 'videos'
  | 'applications'
  | 'new'
  | 'cut'
  | 'copy'
  | 'paste'
  | 'copyPath'
  | 'move'
  | 'trash'
  | 'rename'
  | 'selectAll'
  | 'refresh'
  | 'back'
  | 'forward'
  | 'up'
  | 'chevronRight'
  | 'chevronDown'
  | 'viewIcons'
  | 'viewList'
  | 'viewDetails'
  | 'close'
  | 'check'
  | 'warning'
  | 'info'
  | 'search'
  | 'eye'
  | 'eyeOff';

/**
 * 内置图标集。
 *
 * Electron 下优先用 app.getFileIcon 拿系统真实图标；拿不到（或跑在浏览器
 * 预览模式）时回退到这套内置 SVG，界面不会出现空白格子。
 */
const STROKE: Record<string, JSX.Element> = {
  package: (
    <>
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" />
      <path d="M4 7.5L12 12l8-4.5M12 12v9" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path d="M21 16l-5-5L6 20" />
    </>
  ),
  video: (
    <>
      <rect x="3" y="5" width="13" height="14" rx="2" />
      <path d="M16 10l5-3v10l-5-3z" />
    </>
  ),
  audio: (
    <>
      <path d="M9 18V5l10-2v13" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="16.5" cy="16" r="2.5" />
    </>
  ),
  pdf: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z" />
      <path d="M14 3v5h5" />
      <path d="M9 14h6M9 17h4" />
    </>
  ),
  doc: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z" />
      <path d="M14 3v5h5M8.5 13h7M8.5 16h7" />
    </>
  ),
  sheet: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M4 9h16M4 15h16M10 9v12M15 9v12" />
    </>
  ),
  slide: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M12 16v4M8 20h8" />
    </>
  ),
  code: (
    <>
      <path d="M9 8l-4 4 4 4M15 8l4 4-4 4" />
    </>
  ),
  text: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z" />
      <path d="M14 3v5h5M9 13h6M9 17h6" />
    </>
  ),
  archive: (
    <>
      <rect x="4" y="4" width="16" height="5" rx="1" />
      <path d="M6 9v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V9M11 13h2" />
    </>
  ),
  app: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M9 9h6v6H9z" />
    </>
  ),
  generic: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z" />
      <path d="M14 3v5h5" />
    </>
  ),
  computer: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </>
  ),
  home: (
    <>
      <path d="M4 11l8-7 8 7" />
      <path d="M6 10v10h12V10" />
      <path d="M10 20v-6h4v6" />
    </>
  ),
  desktop: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </>
  ),
  documents: (
    <>
      <path d="M8 3h8a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
      <path d="M10 8h4M10 12h4M10 16h4" />
    </>
  ),
  downloads: (
    <>
      <path d="M12 3v12" />
      <path d="M7 11l5 5 5-5" />
      <path d="M5 20h14" />
    </>
  ),
  pictures: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path d="M21 16l-5-5L6 20" />
    </>
  ),
  music: (
    <>
      <path d="M9 18V5l10-2v13" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="16.5" cy="16" r="2.5" />
    </>
  ),
  videos: (
    <>
      <rect x="3" y="5" width="13" height="14" rx="2" />
      <path d="M16 10l5-3v10l-5-3z" />
    </>
  ),
  applications: (
    <>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </>
  ),
  new: (
    <>
      <path d="M12 5v14M5 12h14" />
    </>
  ),
  cut: (
    <>
      <circle cx="6" cy="17" r="2.5" />
      <circle cx="18" cy="17" r="2.5" />
      <path d="M7.5 15L18 4M16.5 15L6 4" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M15 5.5A1.5 1.5 0 0 0 13.5 4H5.5A1.5 1.5 0 0 0 4 5.5v8A1.5 1.5 0 0 0 5.5 15" />
    </>
  ),
  paste: (
    <>
      <rect x="4" y="5" width="12" height="15" rx="2" />
      <path d="M16 8h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-8" />
      <path d="M8 5V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v1" />
    </>
  ),
  copyPath: (
    <>
      <path d="M9 9h9v9H9z" />
      <path d="M15 6H6v9" />
      <path d="M11.5 12.5h4M13.5 10.5v4" />
    </>
  ),
  move: (
    <>
      <path d="M4 8h6V4h10v10h-4" />
      <path d="M10 20v-8h10v8H10z" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="M9 7V4h6v3" />
      <path d="M6 7l1 13h10l1-13" />
      <path d="M10 11v6M14 11v6" />
    </>
  ),
  rename: (
    <>
      <path d="M4 20h16" />
      <path d="M6 16l9-9 3 3-9 9H6v-3z" />
    </>
  ),
  selectAll: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 12l3 3 5-6" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 12a8 8 0 1 1-2.3-5.7" />
      <path d="M20 4v5h-5" />
    </>
  ),
  back: <path d="M15 5l-7 7 7 7" />,
  forward: <path d="M9 5l7 7-7 7" />,
  up: <path d="M5 15l7-7 7 7" />,
  chevronRight: <path d="M9 5l7 7-7 7" />,
  chevronDown: <path d="M5 9l7 7 7-7" />,
  viewIcons: (
    <>
      <rect x="4" y="4" width="7" height="7" rx="1" />
      <rect x="13" y="4" width="7" height="7" rx="1" />
      <rect x="4" y="13" width="7" height="7" rx="1" />
      <rect x="13" y="13" width="7" height="7" rx="1" />
    </>
  ),
  viewList: (
    <>
      <path d="M4 6h4M4 12h4M4 18h4M10 6h10M10 12h10M10 18h10" />
    </>
  ),
  viewDetails: (
    <>
      <path d="M4 6h16M4 12h16M4 18h16" />
      <path d="M9 6v12" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6L6 18" />,
  check: <path d="M5 13l4 4L19 7" />,
  warning: (
    <>
      <path d="M12 4l9 16H3l9-16z" />
      <path d="M12 10v4M12 17h.01" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="M15.5 15.5L20 20" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6z" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M4 4l16 16" />
      <path d="M9.9 5.2A9.7 9.7 0 0 1 12 5c6.4 0 10 6 10 6a17 17 0 0 1-2.4 3.1M6.3 7.7A17 17 0 0 0 2 11s3.6 6 10 6c1 0 1.9-.1 2.7-.4" />
    </>
  ),
};

/** 这几个用填充色更像 Windows 资源管理器 */
const FILLED: Partial<Record<IconName, string>> = {
  folder: '#f6c445',
};

const FOLDER_PATH = (
  <path d="M3 7a2 2 0 0 1 2-2h3.4a2 2 0 0 1 1.5.7L11.2 7H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
);

export interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
}

export function Icon({ name, size = 16, className }: IconProps): JSX.Element {
  const fill = FILLED[name];
  const strokeWidth = size >= 24 ? 1.5 : 1.6;

  const content =
    name === 'folder' ? (
      <>
        {FOLDER_PATH}
        <path d="M3 9h18" opacity="0.35" />
      </>
    ) : (
      STROKE[name] ?? STROKE.generic
    );

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ? 'none' : 'none'}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {fill ? (
        <>
          <g fill={fill} stroke="#d9a406">
            {content}
          </g>
        </>
      ) : (
        content
      )}
    </svg>
  );
}
