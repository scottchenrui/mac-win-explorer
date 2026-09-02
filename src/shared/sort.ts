import type { FsEntry, SortSpec } from './types';

// numeric: true 让 Item2 < Item10，与 Windows 资源管理器的自然排序一致
const collator = new Intl.Collator('zh-Hans-CN', {
  numeric: true,
  sensitivity: 'base',
});

/**
 * Windows 资源管理器的排序规则：文件夹永远排在文件前面，其余按所选列排序。
 */
export function makeComparator(spec: SortSpec): (a: FsEntry, b: FsEntry) => number {
  const dir = spec.dir === 'asc' ? 1 : -1;
  const dirFirst = (a: FsEntry, b: FsEntry): number => {
    const aIsDir = a.kind === 'dir' && !a.isPackage;
    const bIsDir = b.kind === 'dir' && !b.isPackage;
    if (aIsDir !== bIsDir) return aIsDir ? -1 : 1;
    return 0;
  };

  return (a, b) => {
    const byKind = dirFirst(a, b);
    if (byKind !== 0) return byKind;

    let cmp = 0;
    switch (spec.key) {
      case 'name':
        cmp = collator.compare(a.name, b.name);
        break;
      case 'mtime':
        cmp = a.mtime - b.mtime;
        break;
      case 'size':
        cmp = a.size - b.size;
        break;
      case 'type':
        cmp = collator.compare(a.typeLabel, b.typeLabel);
        if (cmp === 0) cmp = collator.compare(a.ext, b.ext);
        break;
    }
    if (cmp === 0) cmp = collator.compare(a.name, b.name);
    return cmp * dir;
  };
}
