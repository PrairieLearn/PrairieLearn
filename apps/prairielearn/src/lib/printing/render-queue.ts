import { Semaphore } from 'async-mutex';

import { HttpStatusError } from '@prairielearn/error';

interface RenderWaiter {
  priority: 'preview' | 'export';
  queuedAt: number;
  resolve: (acquired: { queueWaitMs: number; release: () => void }) => void;
  reject: (error: Error) => void;
  cleanup: () => void;
}

export type RenderPriority = 'preview' | 'export';

export class RenderQueue {
  private readonly permits: Semaphore;
  private readonly waiters: RenderWaiter[] = [];
  private active = 0;
  private previewsSinceExport = 0;

  constructor(
    limit: number,
    private readonly maxWaiters: number,
    private readonly reservedPreviewWaiters = 0,
  ) {
    this.permits = new Semaphore(limit);
  }

  getLoad() {
    return {
      active: this.active,
      waiting: this.waiters.length,
      waitingPreviews: this.waiters.filter((waiter) => waiter.priority === 'preview').length,
      canStartImmediately: !this.permits.isLocked() && this.waiters.length === 0,
    };
  }

  async run<T>(
    callback: (queueWaitMs: number) => Promise<T>,
    timeoutMs: number,
    outputLabel: string,
    priority: RenderPriority = 'export',
    signal?: AbortSignal,
  ): Promise<T> {
    const { queueWaitMs, release } = await this.acquire(timeoutMs, outputLabel, priority, signal);
    try {
      signal?.throwIfAborted();
      return await callback(queueWaitMs);
    } finally {
      this.release(release);
    }
  }

  rejectAll(error: Error): void {
    const waiters = [...this.waiters];
    this.waiters.length = 0;
    for (const waiter of waiters) {
      waiter.cleanup();
      waiter.reject(error);
    }
  }

  private async acquire(
    timeoutMs: number,
    outputLabel: string,
    priority: RenderPriority,
    signal?: AbortSignal,
  ): Promise<{ queueWaitMs: number; release: () => void }> {
    signal?.throwIfAborted();
    if (!this.permits.isLocked()) {
      const [, release] = await this.permits.acquire();
      this.active += 1;
      return { queueWaitMs: 0, release };
    }

    if (
      this.waiters.length >= this.maxWaiters ||
      (priority === 'export' &&
        this.waiters.filter((waiter) => waiter.priority === 'export').length >=
          this.maxWaiters - this.reservedPreviewWaiters)
    ) {
      throw new HttpStatusError(
        503,
        priority === 'preview'
          ? 'Print preview is busy. Try again shortly.'
          : 'Print rendering is busy. Try this export again shortly.',
      );
    }

    // withTimeout() leaves expired acquisitions in async-mutex's queue until a permit is
    // released. Keep waiters here so a timed-out render immediately frees its queue slot.
    return new Promise<{ queueWaitMs: number; release: () => void }>((resolve, reject) => {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const rejectWaiter = (error: unknown) => {
        const index = this.waiters.indexOf(waiter);
        if (index === -1) return;
        this.waiters.splice(index, 1);
        waiter.cleanup();
        reject(error);
      };
      const onAbort = () => rejectWaiter(signal?.reason);
      const waiter: RenderWaiter = {
        priority,
        queuedAt: Date.now(),
        resolve,
        reject,
        cleanup: () => {
          if (timeout) clearTimeout(timeout);
          signal?.removeEventListener('abort', onAbort);
        },
      };
      if (timeoutMs > 0) {
        timeout = setTimeout(() => {
          rejectWaiter(
            new Error(`Timed out after ${timeoutMs} ms waiting to render the ${outputLabel}`),
          );
        }, timeoutMs);
      }
      this.waiters.push(waiter);
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  private release(release: () => void): void {
    if (this.waiters.length === 0) {
      this.active -= 1;
      release();
      return;
    }
    const previewIndex = this.waiters.findIndex((waiter) => waiter.priority === 'preview');
    const exportIndex = this.waiters.findIndex((waiter) => waiter.priority === 'export');
    const choosePreview =
      previewIndex !== -1 && (exportIndex === -1 || this.previewsSinceExport < 3);
    const next = this.waiters.splice(choosePreview ? previewIndex : exportIndex, 1)[0];
    this.previewsSinceExport = choosePreview ? this.previewsSinceExport + 1 : 0;
    // Transfer the permit directly so a new render cannot pass the oldest waiter.
    next.cleanup();
    next.resolve({ queueWaitMs: Date.now() - next.queuedAt, release });
  }
}
