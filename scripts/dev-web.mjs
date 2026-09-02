import { context } from 'esbuild';
import { spawn } from 'node:child_process';

/**
 * 浏览器预览模式：Express 后端（真实读写文件系统）+ Vite 前端。
 *
 * 这是唯一能在浏览器里用 URL 预览的方式 —— Electron 是桌面应用，无法用 URL 打开。
 * 后端只绑 127.0.0.1，且不会进入打包产物。
 *
 * 后端跑的是 esbuild 产物而非 ts 源码，所以必须 watch：改了 src/core 或
 * src/shared 之后自动重建并重启 api 进程，否则改动完全看不到效果。
 */
const API_PORT = 5174;
const DEV_PORT = 5173;

const buildCtx = await context({
  entryPoints: ['src/server/index.ts'],
  outfile: 'dist/server/index.js',
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  sourcemap: true,
  packages: 'external',
  logLevel: 'warning',
  plugins: [
    {
      name: 'restart-api',
      setup(build) {
        build.onEnd((result) => {
          if (result.errors.length > 0) return;
          restartApi();
        });
      },
    },
  ],
});

const children = new Map();

function start(name, cmd, args, env) {
  const child = spawn(cmd, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...env },
  });
  const tag = `[${name}]`;
  child.stdout.on('data', (buf) => process.stdout.write(`${tag} ${buf}`));
  child.stderr.on('data', (buf) => process.stderr.write(`${tag} ${buf}`));
  child.on('exit', (code, signal) => {
    // 主动重启（SIGTERM）不算异常
    if (code !== null && code !== 0 && signal !== 'SIGTERM') {
      console.log(`${tag} 退出，码 ${code}`);
    }
  });
  children.set(name, child);
  return child;
}

function restartApi() {
  children.get('api')?.kill('SIGTERM');
  start('api', process.execPath, ['dist/server/index.js'], { API_PORT: String(API_PORT) });
}

// 首次构建会触发插件的 onEnd → 拉起 api 进程
await buildCtx.rebuild();
start('web', 'node_modules/.bin/vite', [], {});

await buildCtx.watch();
console.log('[dev:web] 已监听 src/{server,core,shared}，改动后后端自动重建重启');
console.log(`[dev:web] 前端  http://127.0.0.1:${DEV_PORT}`);
console.log(`[dev:web] 后端  http://127.0.0.1:${API_PORT}`);
console.log('[dev:web] 预览模式下原生能力（打开/废纸篓/系统图标）不可用，按钮会自动灰显');

function shutdown() {
  for (const child of children.values()) child.kill('SIGTERM');
  void buildCtx.dispose();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
