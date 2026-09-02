import type { Api } from '@shared/api-contract';
import { createElectronApi, hasElectronBridge } from './electron';
import { createHttpApi } from './http';

export const isElectron = hasElectronBridge();

/**
 * 渲染层唯一的数据入口。组件不知道自己跑在 Electron 里还是浏览器里。
 */
export const api: Api = isElectron ? createElectronApi() : createHttpApi();

export { isMac, isModPressed, modLabel } from '../utils/platform';
