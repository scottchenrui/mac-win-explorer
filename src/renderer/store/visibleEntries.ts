import type { FsEntry } from '@shared/types';

export function visibleEntries(state: { entries: FsEntry[]; filter: string }): FsEntry[] {
  const keyword = state.filter.trim().toLowerCase();
  return keyword ? state.entries.filter((entry) => entry.name.toLowerCase().includes(keyword)) : state.entries;
}
