import { context } from 'esbuild';
import { spawn } from 'node:child_process';

/**
 * 桌面开发模式：main + preload 用 esbuild watch，renderer 用 vite，
 * 再用 electronmon 启动 Electron。
 *
 * 环境变量：
 * - RENDERER_URL=http://127.0.0.1:5173 → 主进程会加载 vite dev server
 */
const RENDERER_PORT = 5173;

async function runVite() {
  return new Promise((resolve, reject) => {
    const child = spawn('node_modules/.bin/vite', [], {
      stdio: 'inherit',
      env: { ...process.env, VITE_PORT: String(RENDERER_PORT) },
    });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`vite 退出码 ${code}`));
    });
  });
}

async function runElectron() {
  const env = {
    ...process.env,
    RENDERER_URL: `http://127.0.0.1:${RENDERER_PORT}`,
  };
  return new Promise((resolve, reject) => {
    const child = spawn('node_modules/.bin/electronmon', ['dist/main/index.js'], {
      stdio: 'inherit',
      env,
    });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`electronmon 退出码 ${code}`));
    });
  });
}

console.log('[dev] 启动桌面开发模式…');

const mainCtx = await context({
  entryPoints: ['src/main/index.ts'],
  outfile: 'dist/main/index.js',
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  sourcemap: true,
  packages: 'external',
  external: ['electron'],
  logLevel: 'warning',
});

const preloadCtx = await context({
  entryPoints: ['src/preload/index.ts'],
  outfile: 'dist/preload/index.js',
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  sourcemap: true,
  packages: 'external',
  external: ['electron'],
  logLevel: 'warning',
});

await mainCtx.rebuild();
await preloadCtx.rebuild();

await Promise.all([mainCtx.watch(), preloadCtx.watch(), runVite(), runElectron()]);
