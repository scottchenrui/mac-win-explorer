import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
import process from 'node:process';

/**
 * 桌面打包后冒烟：启动 Electron，等 renderer loaded，
 * 用 CDP 连进去截图并断言基本 UI 元素存在。
 *
 * 开发机有显示器时可直接运行 `node scripts/smoke.mjs`；
 * CI / 无头环境加 `xvfb-run -a`。
 */
const ELECTRON = 'node_modules/.bin/electron';
const PORT = 9229;

async function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

let electronChild = null;

function runElectron() {
  return new Promise((resolve, reject) => {
    electronChild = spawn(
      ELECTRON,
      ['--no-sandbox', `--remote-debugging-port=${PORT}`, 'dist/main/index.js'],
      { stdio: 'inherit', env: { ...process.env } },
    );
    electronChild.on('exit', (code) => resolve(code));
    electronChild.on('error', reject);
  });
}

async function main() {
  // 先让 Electron 启动
  const running = runElectron();

  // 等 CDP 端口可用
  for (let i = 0; i < 30; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (res.ok) break;
    } catch {
      // not ready
    }
    await wait(500);
  }

  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
  const page = browser.contexts()[0]?.pages()[0] ?? (await browser.newPage());

  await wait(1500);

  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

  const counts = {
    cmdbarBtns: await page.$$eval('.cmdbar__btn', (e) => e.length),
    rows: await page.$$eval('.row', (e) => e.length),
    statusText: await page.textContent('.statusbar'),
  };

  await page.screenshot({ path: 'dist/smoke.png' });
  await browser.close();

  console.log('桌面冒烟结果:');
  console.log(JSON.stringify(counts, null, 2));
  console.log('控制台错误:', errors.length ? errors.slice(0, 5).join('\n') : '无');

  if (counts.cmdbarBtns < 10) {
    console.error('命令栏按钮数量异常');
    process.exitCode = 1;
  }
  if (errors.length) {
    console.error('发现渲染层控制台错误');
    process.exitCode = 1;
  }

  // 主动结束 Electron 子进程，否则 xvfb-run 会等它自然退出
  if (electronChild && !electronChild.killed) {
    electronChild.kill('SIGTERM');
  }

  // 等子进程退出后返回码
  await running;
}

main().catch((e) => {
  console.error(e);
  if (electronChild && !electronChild.killed) electronChild.kill('SIGTERM');
  process.exit(1);
});
