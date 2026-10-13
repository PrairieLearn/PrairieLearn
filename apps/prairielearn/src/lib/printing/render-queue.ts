import { Semaphore } from 'async-mutex';

interface RenderWaiter {
  queuedAt: number;
  resolve: (acquired: { queueWaitMs: number; release: () => void }) => void;
  reject: (error: Error) => void;
  timeout?: ReturnType<typeof setTimeout>;
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
  ): Promise<T> {
    const { queueWaitMs, release } = await this.acquire(timeoutMs, outputLabel);
    try {
      return await callback(queueWaitMs);
    } finally {
      this.release(release);
    }
  }

  rejectAll(error: Error): void {
    const waiters = [...this.waiters];
    this.waiters.length = 0;
    for (const waiter of waiters) {
      if (waiter.timeout) clearTimeout(waiter.timeout);
      waiter.reject(error);
    }
  }

  private async acquire(
    timeoutMs: number,
    outputLabel: string,
  ): Promise<{ queueWaitMs: number; release: () => void }> {
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
      const waiter: RenderWaiter = { queuedAt: Date.now(), resolve, reject };
      if (timeoutMs > 0) {
        waiter.timeout = setTimeout(() => {
          const index = this.waiters.indexOf(waiter);
          if (index === -1) return;
          this.waiters.splice(index, 1);
          reject(new Error(`Timed out after ${timeoutMs} ms waiting to render the ${outputLabel}`));
        }, timeoutMs);
      }
      this.waiters.push(waiter);
    });
  }

  private release(release: () => void): void {
    const next = this.waiters.shift();
    if (next) {
      // Transfer the permit directly so a new render cannot pass the oldest waiter.
      if (next.timeout) clearTimeout(next.timeout);
      next.resolve({ queueWaitMs: Date.now() - next.queuedAt, release });
    } else {
      release();
    }
  }
}
