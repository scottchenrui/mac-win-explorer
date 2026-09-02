import { Router } from 'express';
import { API_NAMES } from '../shared/api-contract';
import { invokeHandler } from '../core/invoke';
import type { CoreContext } from '../core/context';

/**
 * 预览通道的路由由同一份 handlers 自动生成 —— 不复制任何业务逻辑，
 * 请求/响应语义与 Electron IPC 通道完全一致（都是 Result 包装）。
 */
export function createApiRouter(ctx: CoreContext): Router {
  const router = Router();

  for (const name of API_NAMES) {
    router.post(`/${name}`, async (req, res) => {
      res.json(await invokeHandler(ctx, name, req.body));
    });
  }

  return router;
}
