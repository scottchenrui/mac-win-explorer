import type { EntryKind } from './types';

/** Windows 资源管理器风格：1024 进制，保留 3 位有效数字 */
export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '';
  if (n < 1024) return `${n} 字节`;
  const units = ['KB', 'MB', 'GB', 'TB', 'PB'];
  let value = n / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  const digits = value < 10 ? 2 : value < 100 ? 1 : 0;
  return `${value.toFixed(digits).replace(/\.0+$/, '')} ${units[i]}`;
}

/** 带千分位的精确字节数，用于属性对话框 */
export function formatExactBytes(n: number): string {
  return `${Math.round(n).toLocaleString('zh-CN')} 字节`;
}

function pad(v: number): string {
  return v < 10 ? `0${v}` : String(v);
}

/** 列表用的日期时间：2026/08/31 11:23 */
export function formatDateTime(ts: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 属性对话框用的完整时间：2026年8月31日 星期一 11:23:45 */
export function formatFullDateTime(ts: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  const week = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][d.getDay()];
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${week} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** 剩余时间：1 小时 3 分钟 / 45 秒 / 剩余时间计算中 */
export function formatEta(seconds: number | undefined): string {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return '剩余时间计算中';
  if (seconds < 1) return '即将完成';
  if (seconds < 60) return `剩余 ${Math.ceil(seconds)} 秒`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m < 60) return s > 0 ? `剩余 ${m} 分 ${s} 秒` : `剩余 ${m} 分钟`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm > 0 ? `剩余 ${h} 小时 ${mm} 分钟` : `剩余 ${h} 小时`;
}

const MODE_TRIPLES: Array<[number, number, number]> = [
  [0o400, 0o200, 0o100],
  [0o040, 0o020, 0o010],
  [0o004, 0o002, 0o001],
];

/** 权限位 → rwxr-xr-x */
export function formatModeString(mode: number): string {
  let out = '';
  for (const [r, w, x] of MODE_TRIPLES) {
    out += mode & r ? 'r' : '-';
    out += mode & w ? 'w' : '-';
    out += mode & x ? 'x' : '-';
  }
  return out;
}

/** 权限位 → 0755 */
export function formatModeOctal(mode: number): string {
  return (mode & 0o777).toString(8).padStart(3, '0');
}

const EXT_LABELS: Record<string, string> = {
  // 文本与代码
  txt: '文本文档',
  md: 'Markdown 文档',
  rtf: 'RTF 文档',
  log: '日志文件',
  json: 'JSON 文件',
  yaml: 'YAML 文件',
  yml: 'YAML 文件',
  toml: 'TOML 文件',
  xml: 'XML 文档',
  csv: 'CSV 文档',
  ts: 'TypeScript 文件',
  tsx: 'TypeScript 文件',
  js: 'JavaScript 文件',
  jsx: 'JavaScript 文件',
  mjs: 'JavaScript 文件',
  cjs: 'JavaScript 文件',
  py: 'Python 文件',
  rb: 'Ruby 文件',
  go: 'Go 文件',
  rs: 'Rust 文件',
  java: 'Java 文件',
  c: 'C 源文件',
  h: 'C 头文件',
  cpp: 'C++ 源文件',
  hpp: 'C++ 头文件',
  swift: 'Swift 文件',
  kt: 'Kotlin 文件',
  sh: 'Shell 脚本',
  zsh: 'Shell 脚本',
  bash: 'Shell 脚本',
  sql: 'SQL 文件',
  html: 'HTML 文档',
  htm: 'HTML 文档',
  css: 'CSS 文件',
  scss: 'SCSS 文件',
  less: 'LESS 文件',
  vue: 'Vue 组件',
  // 文档
  pdf: 'PDF 文档',
  doc: 'Word 文档',
  docx: 'Word 文档',
  xls: 'Excel 工作簿',
  xlsx: 'Excel 工作簿',
  ppt: 'PowerPoint 演示文稿',
  pptx: 'PowerPoint 演示文稿',
  numbers: 'Numbers 文稿',
  pages: 'Pages 文稿',
  key: 'Keynote 演示文稿',
  epub: '电子书',
  // 图片
  png: 'PNG 图像',
  jpg: 'JPEG 图像',
  jpeg: 'JPEG 图像',
  gif: 'GIF 图像',
  bmp: 'BMP 图像',
  webp: 'WebP 图像',
  svg: 'SVG 图像',
  heic: 'HEIC 图像',
  icns: 'macOS 图标文件',
  ico: '图标文件',
  psd: 'Photoshop 文档',
  sketch: 'Sketch 文档',
  fig: 'Figma 文档',
  ai: 'Illustrator 文档',
  tiff: 'TIFF 图像',
  tif: 'TIFF 图像',
  // 音视频
  mp3: 'MP3 音频',
  wav: 'WAV 音频',
  flac: 'FLAC 音频',
  aac: 'AAC 音频',
  m4a: 'MPEG-4 音频',
  ogg: 'OGG 音频',
  mp4: 'MP4 视频',
  mov: 'QuickTime 影片',
  mkv: 'Matroska 视频',
  avi: 'AVI 视频',
  webm: 'WebM 视频',
  m4v: 'MPEG-4 视频',
  // 压缩包
  zip: 'ZIP 压缩文件',
  rar: 'RAR 压缩文件',
  '7z': '7-Zip 压缩文件',
  gz: 'Gzip 压缩文件',
  bz2: 'Bzip2 压缩文件',
  xz: 'XZ 压缩文件',
  tar: 'TAR 归档文件',
  dmg: '磁盘映像',
  iso: '光盘映像',
  // 其他
  app: '应用程序',
  pkg: '安装包',
  exe: '应用程序',
  dll: '应用程序扩展',
  lnk: '快捷方式',
  torrent: 'BitTorrent 文件',
};

const PACKAGE_LABELS: Record<string, string> = {
  app: '应用程序',
  bundle: '捆绑包',
  framework: '框架',
  pkg: '安装包',
  xpc: 'XPC 服务',
  plugin: '插件',
  appex: '应用扩展',
  photoslibrary: '照片图库',
  xcodeproj: 'Xcode 工程',
  xcworkspace: 'Xcode 工作区',
  playlists: '播放列表包',
  band: 'Pages 文稿模板',
};

const SPECIAL_NAMES: Record<string, string> = {
  '.git': 'Git 仓库',
  '.gitignore': 'Git 忽略规则',
  '.npmrc': 'npm 配置文件',
  '.zshrc': 'Zsh 配置',
  '.bashrc': 'Bash 配置',
  '.env': '环境变量文件',
  Dockerfile: 'Docker 构建文件',
  Makefile: 'Make 构建文件',
  LICENSE: '许可证文件',
  'README.md': 'Markdown 文档',
  'package.json': 'JSON 文件',
  'tsconfig.json': 'JSON 文件',
};

/** 推断中文类型标签，与 Windows 的"类型"列对齐 */
export function typeLabelFor(
  name: string,
  kind: EntryKind,
  isPackage: boolean,
  ext: string,
): string {
  if (kind === 'dir') {
    if (isPackage) return PACKAGE_LABELS[ext.slice(1).toLowerCase()] ?? '捆绑包';
    return '文件夹';
  }
  if (kind === 'symlink') return '替身';
  if (SPECIAL_NAMES[name]) return SPECIAL_NAMES[name];
  const key = ext.slice(1).toLowerCase();
  if (EXT_LABELS[key]) return EXT_LABELS[key];
  if (key) return `${key.toUpperCase()} 文件`;
  return '文件';
}

/** 图标种类，用于选中内置 SVG 图标 */
export type IconCategory =
  | 'folder'
  | 'package'
  | 'image'
  | 'video'
  | 'audio'
  | 'pdf'
  | 'doc'
  | 'sheet'
  | 'slide'
  | 'code'
  | 'text'
  | 'archive'
  | 'disk'
  | 'app'
  | 'generic';

export function iconCategoryFor(kind: EntryKind, isPackage: boolean, ext: string): IconCategory {
  if (kind === 'dir') return isPackage ? 'package' : 'folder';
  if (kind === 'symlink') return 'generic';
  const key = ext.slice(1).toLowerCase();
  if (['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'heic', 'tiff', 'tif', 'ico', 'icns'].includes(key))
    return 'image';
  if (['mp4', 'mov', 'mkv', 'avi', 'webm', 'm4v'].includes(key)) return 'video';
  if (['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg'].includes(key)) return 'audio';
  if (key === 'pdf') return 'pdf';
  if (['doc', 'docx', 'rtf', 'pages', 'epub', 'md'].includes(key)) return 'doc';
  if (['xls', 'xlsx', 'csv', 'numbers'].includes(key)) return 'sheet';
  if (['ppt', 'pptx', 'key'].includes(key)) return 'slide';
  if (
    [
      'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'py', 'rb', 'go', 'rs', 'java', 'c', 'h',
      'cpp', 'hpp', 'swift', 'kt', 'sh', 'zsh', 'bash', 'sql', 'html', 'htm', 'css',
      'scss', 'less', 'vue', 'json', 'yaml', 'yml', 'toml', 'xml',
    ].includes(key)
  )
    return 'code';
  if (['txt', 'log'].includes(key)) return 'text';
  if (['zip', 'rar', '7z', 'gz', 'bz2', 'xz', 'tar', 'dmg', 'iso'].includes(key)) return 'archive';
  if (key === 'app' || key === 'exe') return 'app';
  return 'generic';
}
