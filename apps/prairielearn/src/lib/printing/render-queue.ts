import { Semaphore } from 'async-mutex';

interface RenderWaiter {
  queuedAt: number;
  resolve: (acquired: { queueWaitMs: number; release: () => void }) => void;
  reject: (error: Error) => void;
  cleanup: () => void;
}

export class RenderQueue {
  private readonly permits: Semaphore;
  private readonly waiters: RenderWaiter[] = [];

  constructor(
    limit: number,
    private readonly maxWaiters: number,
  ) {
    this.permits = new Semaphore(limit);
  }

  async run<T>(
    callback: (queueWaitMs: number) => Promise<T>,
    timeoutMs: number,
    outputLabel: string,
    signal?: AbortSignal,
  ): Promise<T> {
    const { queueWaitMs, release } = await this.acquire(timeoutMs, outputLabel, signal);
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
    signal?: AbortSignal,
  ): Promise<{ queueWaitMs: number; release: () => void }> {
    signal?.throwIfAborted();
    if (!this.permits.isLocked()) {
      const [, release] = await this.permits.acquire();
      return { queueWaitMs: 0, release };
    }

    if (this.waiters.length >= this.maxWaiters) {
      throw new Error('Too many print renders are already waiting');
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
    const next = this.waiters.shift();
    if (next) {
      // Transfer the permit directly so a new render cannot pass the oldest waiter.
      next.cleanup();
      next.resolve({ queueWaitMs: Date.now() - next.queuedAt, release });
    } else {
      release();
    }
  }
}
