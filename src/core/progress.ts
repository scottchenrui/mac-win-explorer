import type { TransferProgress } from '../shared/types';

export type ProgressListener = (payload: TransferProgress) => void;

/**
 * 进度广播。
 *
 * 节流到每秒 10 次：大批量小文件时，逐文件推送会让渲染层被 IPC 消息淹没，
 * 界面反而卡死。终态（done/error/cancelled/conflict）必须立刻发出。
 */
const THROTTLE_MS = 100;

export class ProgressBus {
  private listeners = new Set<ProgressListener>();
  private lastEmitAt = new Map<string, number>();

  subscribe(listener: ProgressListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(payload: TransferProgress): void {
    const isFinal =
      payload.phase === 'done' ||
      payload.phase === 'error' ||
      payload.phase === 'cancelled' ||
      payload.phase === 'conflict';

    const now = Date.now();
    const last = this.lastEmitAt.get(payload.opId) ?? 0;
    if (!isFinal && now - last < THROTTLE_MS) return;
    this.lastEmitAt.set(payload.opId, now);

    if (isFinal) this.lastEmitAt.delete(payload.opId);
    for (const listener of this.listeners) listener(payload);
  }
}

/** 滑动窗口速率估算，用于计算剩余时间 */
export class RateMeter {
  private samples: Array<{ at: number; bytes: number }> = [];

  constructor(private readonly windowMs = 3000) {}

  reset(): void {
    this.samples = [];
  }

  /** 累计字节数打点，返回瞬时速率（字节/秒） */
  sample(totalBytes: number): number {
    const now = Date.now();
    this.samples.push({ at: now, bytes: totalBytes });
    const cutoff = now - this.windowMs;
    while (this.samples.length > 2 && this.samples[0].at < cutoff) this.samples.shift();

    const first = this.samples[0];
    const last = this.samples[this.samples.length - 1];
    const dt = (last.at - first.at) / 1000;
    if (dt <= 0) return 0;
    return Math.max(0, (last.bytes - first.bytes) / dt);
  }

  eta(processedBytes: number, totalBytes: number): number | undefined {
    const rate = this.sample(processedBytes);
    if (rate < 1) return undefined;
    return Math.max(0, (totalBytes - processedBytes) / rate);
  }
}
