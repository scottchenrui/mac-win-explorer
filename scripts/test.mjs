import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
await build({ entryPoints: ['tests/regressions.ts'], outfile: 'node_modules/.cache/regressions.cjs', bundle: true, platform: 'node', format: 'cjs', packages: 'external', tsconfig: 'tsconfig.web.json' });
const result = spawnSync(process.execPath, ['node_modules/.cache/regressions.cjs'], { stdio: 'inherit' });
process.exitCode = result.status ?? 1;
