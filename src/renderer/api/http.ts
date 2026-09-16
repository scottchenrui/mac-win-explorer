import { watchSession } from './session';
import { API_NAMES, type Api } from '@shared/api-contract';
import type { Result } from '@shared/errors';

/**
 * 浏览器预览通道。
 *
 * 请求走 Vite dev server 代理到 127.0.0.1:5174 的 Express 后端，
 * 后端与 Electron 主进程共用同一份 handlers，因此行为完全一致。
 */
export function createHttpApi(): Api {
  const api = {} as Record<string, unknown>;

  for (const name of API_NAMES) {
    api[name] = async (req?: unknown): Promise<Result<unknown>> => {
      const response = await fetch(`/api/${name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Watch-Session': watchSession },
        body: JSON.stringify(req ?? {}),
      });
      return (await response.json()) as Result<unknown>;
    };
  }

  return api as unknown as Api;
}
