import type { Request, Response } from 'express';
import type { CoreContext } from '../core/context';

/**
 * 预览通道的事件流。
 *
 * Electron 版本用 webContents.send 推同样的两个事件，渲染层的订阅代码是同一份。
 */
export function createSseHandler(ctx: CoreContext) {
  return (req: Request, res: Response): void => {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    // 关掉代理缓冲，否则进度会被攒着一起发
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const send = (event: string, payload: unknown): void => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
    };

    const offProgress = ctx.progress.subscribe((payload) => send('progress', payload));
    const offWatch = ctx.watchBus.subscribe((dir) => send('watch', { path: dir }));

    // 心跳：防止中间层把空闲连接掐断
    const heartbeat = setInterval(() => res.write(': ping\n\n'), 15_000);

    req.on('close', () => {
      clearInterval(heartbeat);
      offProgress();
      offWatch();
    });
  };
}
