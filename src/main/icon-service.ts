import { app } from 'electron';

/** 图标缓存：避免反复调 app.getFileIcon（它要查 Launch Services，不便宜） */
class IconCache {
  private readonly map = new Map<string, string | null>();
  constructor(private readonly max = 200) {}

  get(path: string): string | null | undefined {
    return this.map.get(path);
  }

  set(path: string, value: string | null): void {
    if (this.map.size >= this.max) {
      const first = this.map.keys().next().value;
      if (first !== undefined) this.map.delete(first);
    }
    this.map.set(path, value);
  }
}

const cache = new IconCache();

/** 批量取系统文件图标 → dataURL。未命中时并发请求。 */
export async function getFileIcons(paths: string[]): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  const missing: string[] = [];

  for (const p of paths) {
    const cached = cache.get(p);
    if (cached !== undefined) out[p] = cached;
    else missing.push(p);
  }

  await Promise.all(
    missing.map(async (p) => {
      try {
        const img = await app.getFileIcon(p);
        const data = img.toDataURL();
        cache.set(p, data);
        out[p] = data;
      } catch {
        cache.set(p, null);
        out[p] = null;
      }
    }),
  );

  return out;
}
