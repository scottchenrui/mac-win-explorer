import type { ApiName, HandlerDef } from '../shared/api-contract';
import { toAppError, type Result } from '../shared/errors';
import type { CoreContext } from './context';
import { handlers } from './handlers';

type AnyHandler = HandlerDef<unknown, unknown, CoreContext>;

/**
 * 两条通道共用的调用入口。
 *
 * 因为 ApiName 是联合类型，直接写 handlers[name].exec(...) 会让参数被推断成
 * 所有请求类型的交叉类型。这里做一次收口断言，通道侧就不必各自重复断言了。
 */
export async function invokeHandler(
  ctx: CoreContext,
  name: ApiName,
  raw: unknown,
): Promise<Result<unknown>> {
  try {
    const handler = handlers[name] as unknown as AnyHandler;
    const request = handler.validate(raw ?? {});
    const data = await handler.exec(request, ctx);
    return { ok: true, data: data ?? null };
  } catch (e) {
    const error = toAppError(e);
    if (error.code === 'UNKNOWN') {
      console.error(`[core] ${name} 执行失败`, e);
    }
    return { ok: false, error };
  }
}
