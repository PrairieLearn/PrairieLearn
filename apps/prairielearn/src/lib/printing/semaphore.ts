interface SemaphoreWaiter {
  queuedAt: number;
  resolve: (queueWaitMs: number) => void;
  reject: (error: Error) => void;
  timeout?: ReturnType<typeof setTimeout>;
}

/** Run a bounded number of print jobs while giving queued jobs a wait deadline. */
export class Semaphore {
  private activeCount = 0;
  private readonly waiters: SemaphoreWaiter[] = [];

  constructor(
    private readonly limit: number,
    private readonly maxWaiters: number,
  ) {}

  async run<T>(
    callback: (queueWaitMs: number) => Promise<T>,
    timeoutMs: number,
    outputLabel: string,
  ): Promise<T> {
    const queueWaitMs = await this.acquire(timeoutMs, outputLabel);
    try {
      return await callback(queueWaitMs);
    } finally {
      this.release();
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

  private async acquire(timeoutMs: number, outputLabel: string): Promise<number> {
    if (this.activeCount < this.limit) {
      this.activeCount += 1;
      return 0;
    }

    if (this.waiters.length >= this.maxWaiters) {
      throw new Error('Too many print renders are already waiting');
    }

    return new Promise<number>((resolve, reject) => {
      const waiter: SemaphoreWaiter = { queuedAt: Date.now(), resolve, reject };
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

  private release(): void {
    const next = this.waiters.shift();
    if (next) {
      // The active permit is transferred directly to the oldest waiter.
      if (next.timeout) clearTimeout(next.timeout);
      next.resolve(Date.now() - next.queuedAt);
    } else {
      this.activeCount -= 1;
    }
  }
}
