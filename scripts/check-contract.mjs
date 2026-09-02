import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { build } from 'esbuild';

/**
 * 运行期防漂移：API 契约名集合必须与实际实现的方法集合完全一致。
 *
 * 编译期与类型期已经各有一道防线，这是第三道 —— 它能抓到
 * "加了方法却忘了写进 API_NAMES" 这类运行时才发现的问题。
 */
const OUT_DIR = 'node_modules/.cache';
const OUT_FILE = path.join(OUT_DIR, 'contract-check.mjs');

mkdirSync(OUT_DIR, { recursive: true });

await build({
  entryPoints: ['scripts/contract-entry.ts'],
  outfile: OUT_FILE,
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  packages: 'external',
  logLevel: 'warning',
});

const mod = await import(pathToFileURL(path.resolve(OUT_FILE)).href);
const declared = [...mod.API_NAMES];
const implemented = Object.keys(mod.handlers);

const declaredSet = new Set(declared);
const implementedSet = new Set(implemented);

const missing = declared.filter((n) => !implementedSet.has(n));
const extra = implemented.filter((n) => !declaredSet.has(n));

if (declared.length !== declaredSet.size) {
  console.error('契约中存在重复的方法名');
  process.exit(1);
}

if (missing.length > 0 || extra.length > 0) {
  if (missing.length) console.error('契约里声明但未实现：', missing.join(', '));
  if (extra.length) console.error('实现了但契约里未声明：', extra.join(', '));
  process.exit(1);
}

console.log(`[check] 契约一致：${declared.length} 个方法全部对齐`);
