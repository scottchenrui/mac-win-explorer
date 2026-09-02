import express from 'express';
import { createContext } from '../core/context';
import { createWebHost } from './host-web';
import { createApiRouter } from './routes';
import { createSseHandler } from './sse';

const PORT = Number(process.env.API_PORT ?? 5174);
const APP_VERSION = process.env.APP_VERSION ?? '0.0.0-dev';

/**
 * 仅供 `npm run dev:web` 使用的预览后端。
 *
 * 只监听 127.0.0.1，且 electron-builder 的 files 白名单里没有 dist/server，
 * 因此它永远不会进入打包产物。
 */
function main(): void {
  const ctx = createContext(createWebHost(), APP_VERSION);
  const app = express();

  app.use(express.json({ limit: '2mb' }));
  app.get('/api/events', createSseHandler(ctx));
  app.use('/api', createApiRouter(ctx));

  app.listen(PORT, '127.0.0.1', () => {
    console.log(`[预览后端] http://127.0.0.1:${PORT}  （仅供开发预览，不进入打包产物）`);
  });
}

main();
