import { existsSync } from 'node:fs';
import { build } from 'esbuild';
import { spawn } from 'node:child_process';

/**
 * 构建入口：
 * - main / preload / server 用 esbuild 打成 CJS（Electron 主进程与 Node 后端都吃这一套）
 * - renderer 交给 vite build（需要 React 插件与 index.html 处理）
 *
 * 某个入口文件不存在时跳过而不是报错，方便分阶段开发。
 */
const targets = [
  {
    name: 'main',
    entry: 'src/main/index.ts',
    out: 'dist/main/index.js',
    external: ['electron'],
  },
  {
    name: 'preload',
    entry: 'src/preload/index.ts',
    out: 'dist/preload/index.js',
    external: ['electron'],
  },
  {
    name: 'server',
    entry: 'src/server/index.ts',
    out: 'dist/server/index.js',
    external: [],
  },
];

console.log('[build] 开始构建…');

for (const t of targets) {
  if (!existsSync(t.entry)) {
    console.log(`[build] 跳过 ${t.name}（${t.entry} 不存在）`);
    continue;
  }
  await build({
    entryPoints: [t.entry],
    outfile: t.out,
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    sourcemap: true,
    logLevel: 'warning',
    // 依赖留在运行时从 node_modules 解析，减小产物并避免打包器误处理原生模块
    packages: 'external',
    external: t.external,
  });
  console.log(`[build] ${t.name} → ${t.out}`);
}

await run('node_modules/.bin/vite', ['build']);
console.log('[build] 完成');

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} 退出码 ${code}`));
    });
  });
}
