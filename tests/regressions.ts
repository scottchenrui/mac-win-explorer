import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import nativeFs from 'node:fs';
import { EventEmitter } from 'node:events';
import path from 'node:path';
import os from 'node:os';
import { createContext } from '../src/core/context';
import { createWebHost } from '../src/server/host-web';
import { walkTree } from '../src/core/walk';
import { invokeHandler } from '../src/core/invoke';
import type { TransferProgress } from '../src/shared/types';

async function fixture(fn: (root: string) => Promise<void>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'explorer-regression-'));
  try { await fn(root); } finally { await fs.rm(root, { recursive: true, force: true }); }
}
function transfer(ctx: ReturnType<typeof createContext>, source: string, dest: string, conflict = 'replace', op = 'copy', onConflict?: () => void) {
  return new Promise<TransferProgress>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('transfer timeout')), 5000);
    const off = ctx.progress.subscribe((p) => {
      if (p.phase === 'conflict') onConflict?.();
      if (['done', 'error', 'cancelled'].includes(p.phase)) { clearTimeout(timeout); off(); resolve(p); }
    });
    ctx.transfer.start({ opId: 'test', sources: [source], destDir: dest, conflict: conflict as any, op: op as any });
  });
}
async function files(root: string) {
  const source = path.join(root, 'source', 'item');
  const dest = path.join(root, 'dest');
  await fs.mkdir(path.dirname(source)); await fs.mkdir(dest);
  await fs.writeFile(source, 'new'); await fs.writeFile(path.join(dest, 'item'), 'old');
  return { source, dest, target: path.join(dest, 'item'), ctx: createContext(createWebHost(), 'test') };
}

test('strict scan rejects truncation, including a single wide directory', async () => fixture(async root => {
  await fs.writeFile(path.join(root, 'a'), 'a'); await fs.writeFile(path.join(root, 'b'), 'b');
  await assert.rejects(walkTree([root], { strict: true, maxItems: 2 }), /完整扫描/);
}));
test('unreadable scan stops move and preserves source and old target', async () => fixture(async root => {
  const { source, dest, target, ctx } = await files(root);
  await fs.unlink(source); await fs.mkdir(source); await fs.writeFile(path.join(source, 'child'), 'new');
  const original = fs.readdir;
  fs.readdir = (async (...args: any[]) => { if (args[0] === source) throw Object.assign(new Error('denied'), { code: 'EACCES' }); return (original as any)(...args); }) as any;
  try { assert.equal((await transfer(ctx, source, dest, 'replace', 'move')).phase, 'error'); }
  finally { fs.readdir = original; }
  assert.equal(await fs.readFile(target, 'utf8'), 'old'); assert.equal(await fs.readFile(path.join(source, 'child'), 'utf8'), 'new');
}));
test('individual replace decision is honored without apply-to-all', async () => fixture(async root => {
  const { source, dest, target, ctx } = await files(root);
  const result = await transfer(ctx, source, dest, 'ask', 'copy', () => ctx.transfer.resolveConflict('test', 'replace', false));
  assert.equal(result.phase, 'done'); assert.equal(await fs.readFile(target, 'utf8'), 'new');
  assert.deepEqual(await fs.readdir(dest), ['item']);
}));
test('copy failure preserves old destination and cleans staging', async () => fixture(async root => {
  const { source, dest, target, ctx } = await files(root);
  const original = fs.copyFile;
  fs.copyFile = async () => { throw Object.assign(new Error('disk full'), { code: 'ENOSPC' }); };
  try { assert.equal((await transfer(ctx, source, dest)).phase, 'error'); } finally { fs.copyFile = original; }
  assert.equal(await fs.readFile(target, 'utf8'), 'old'); assert.deepEqual(await fs.readdir(dest), ['item']);
}));
test('commit failure restores old destination', async () => fixture(async root => {
  const { source, dest, target, ctx } = await files(root);
  const original = fs.rename;
  fs.rename = async (from, to) => { if (path.basename(String(from)) === 'payload') throw new Error('commit failure'); return original(from, to); };
  try { assert.equal((await transfer(ctx, source, dest)).phase, 'error'); } finally { fs.rename = original; }
  assert.equal(await fs.readFile(target, 'utf8'), 'old'); assert.deepEqual(await fs.readdir(dest), ['item']);
}));
test('cancel during copy preserves source and old destination', async () => fixture(async root => {
  const { source, dest, target, ctx } = await files(root);
  const original = fs.copyFile;
  fs.copyFile = async (...args) => { await original(...args); ctx.transfer.cancel('test'); };
  try { assert.equal((await transfer(ctx, source, dest, 'replace', 'move')).phase, 'cancelled'); } finally { fs.copyFile = original; }
  assert.equal(await fs.readFile(target, 'utf8'), 'old'); assert.equal(await fs.readFile(source, 'utf8'), 'new');
}));
test('move never recursively deletes newly created source files', async () => fixture(async root => {
  const { source, dest, ctx } = await files(root);
  await fs.unlink(source); await fs.mkdir(source); await fs.writeFile(path.join(source, 'a'), 'a');
  const original = fs.copyFile;
  fs.copyFile = async (...args) => { await original(...args); await fs.writeFile(path.join(source, 'late'), 'keep'); };
  try { assert.equal((await transfer(ctx, source, dest, 'replace', 'move')).phase, 'error'); } finally { fs.copyFile = original; }
  assert.equal(await fs.readFile(path.join(source, 'late'), 'utf8'), 'keep');
  assert.equal(await fs.readFile(path.join(dest, 'item', 'a'), 'utf8'), 'a');
}));
test('successful replacement move removes source only after commit', async () => fixture(async root => {
  const { source, dest, target, ctx } = await files(root);
  assert.equal((await transfer(ctx, source, dest, 'replace', 'move')).phase, 'done');
  assert.equal(await fs.readFile(target, 'utf8'), 'new'); await assert.rejects(fs.stat(source), { code: 'ENOENT' });
}));
test('two window subscriptions survive one window leaving and close with last owner', async () => fixture(async root => {
  const original = nativeFs.watch;
  let notify = () => {};
  let closes = 0;
  let starts = 0;
  nativeFs.watch = ((_path: unknown, _options: unknown, listener: () => void) => {
    starts += 1;
    notify = listener;
    return Object.assign(new EventEmitter(), { close: () => { closes += 1; } });
  }) as any;
  const ctx = createContext(createWebHost(), 'test');
  try {
    await invokeHandler(ctx, 'watchStart', { path: root }, 'window-a');
    await invokeHandler(ctx, 'watchStart', { path: root }, 'window-a');
    await invokeHandler(ctx, 'watchStart', { path: root }, 'window-b');
    await invokeHandler(ctx, 'watchStop', { path: root }, 'window-a');
    assert.equal(starts, 1); assert.equal(closes, 0);
    const changed = new Promise<void>((resolve) => ctx.watchBus.subscribe(() => resolve()));
    notify(); await changed;
    ctx.watcher.releaseOwner('window-b');
    assert.equal(closes, 1);
    assert.equal(ctx.watcher.unwatch(root, 'window-b'), false);
  } finally { ctx.watcher.stopAll(); nativeFs.watch = original; }
}));
test('filtered selection, range and inversion exclude invisible entries', async () => {
  const { useAppStore } = await import('../src/renderer/store/appStore');
  const entries = ['match-a', 'hidden', 'match-b'].map(name => ({ path: '/' + name, name })) as any;
  useAppStore.setState({ entries, filter: '', selection: ['/hidden'], anchor: '/hidden' });
  const store = useAppStore.getState();
  store.setFilter('match'); assert.deepEqual(useAppStore.getState().selection, []);
  store.selectAll(); assert.deepEqual(useAppStore.getState().selection, ['/match-a', '/match-b']);
  store.selectOnly('/match-a'); store.selectRange('/match-b');
  assert.deepEqual(useAppStore.getState().selection, ['/match-a', '/match-b']);
  store.selectOnly('/match-a'); store.invertSelection(); assert.deepEqual(useAppStore.getState().selection, ['/match-b']);
});

test('cross-volume fallback commits before removing source', async () => fixture(async root => {
  const { source, dest, target, ctx } = await files(root);
  await fs.unlink(target);
  const original = fs.rename;
  fs.rename = async (from, to) => {
    if (from === source) throw Object.assign(new Error('cross device'), { code: 'EXDEV' });
    return original(from, to);
  };
  try { assert.equal((await transfer(ctx, source, dest, 'replace', 'move')).phase, 'done'); }
  finally { fs.rename = original; }
  assert.equal(await fs.readFile(target, 'utf8'), 'new'); await assert.rejects(fs.stat(source), { code: 'ENOENT' });
}));
test('changed source is retained after copying', async () => fixture(async root => {
  const { source, dest, ctx } = await files(root);
  const original = fs.copyFile;
  fs.copyFile = async (...args) => { await original(...args); await fs.writeFile(source, 'changed content'); };
  try { assert.equal((await transfer(ctx, source, dest, 'replace', 'move')).phase, 'error'); }
  finally { fs.copyFile = original; }
  assert.equal(await fs.readFile(source, 'utf8'), 'changed content');
}));
test('replacement supports dangling symbolic links', async () => fixture(async root => {
  const { source, dest, target, ctx } = await files(root);
  await fs.unlink(source); await fs.symlink('missing', source);
  assert.equal((await transfer(ctx, source, dest)).phase, 'done');
  assert.equal(await fs.readlink(target), 'missing');
}));

test('native clipboard commands leave rename text editing untouched', async () => {
  const { routeClipboard } = await import('../src/renderer/utils/clipboard');
  const calls: string[] = [];
  const actions = { copySelection: () => calls.push('copy'), cutSelection: () => calls.push('cut'), pasteHere: async () => { calls.push('paste'); } };
  for (const type of ['copy', 'cut', 'paste']) {
    routeClipboard({ type, preventDefault: () => calls.push('prevent') }, { editing: true, renaming: true, textSelected: true, dialogOpen: false }, actions);
  }
  assert.deepEqual(calls, []);
  for (const type of ['copy', 'cut', 'paste']) {
    routeClipboard({ type, preventDefault: () => calls.push('prevent') }, { editing: false, renaming: false, textSelected: false, dialogOpen: false }, actions);
  }
  assert.deepEqual(calls, ['prevent', 'copy', 'prevent', 'cut', 'prevent', 'paste']);
});
test('copying selected filename text does not overwrite file clipboard', async () => {
  const { routeClipboard } = await import('../src/renderer/utils/clipboard');
  routeClipboard({ type: 'copy', preventDefault: () => assert.fail('must allow native copy') },
    { editing: false, renaming: false, textSelected: true, dialogOpen: false },
    { copySelection: () => assert.fail('must not copy file'), cutSelection: () => {}, pasteHere: async () => {} });
});
