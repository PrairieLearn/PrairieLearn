import { EventEmitter } from 'node:events';

import type { Response } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withResolvers } from '@prairielearn/utils';

import { initPrintRequests, stopPrintRequests, withPrintRequest } from './print-request.js';

type PrintRequest = Parameters<Parameters<typeof withPrintRequest>[1]>[0];

function createResponse() {
  return Object.assign(new EventEmitter(), {
    destroyed: false,
    writableFinished: false,
  }) as Response;
}

describe('print request deadlines', () => {
  beforeEach(() => {
    initPrintRequests();
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => vi.useRealTimers());

  it('aborts at the deadline while keeping the remaining-time getter positive and nonthrowing', async () => {
    const started = withResolvers<PrintRequest>();
    const finish = withResolvers<undefined>();
    const result = withPrintRequest(createResponse(), async (request) => {
      started.resolve(request);
      await finish.promise;
    });
    const failure = result.catch((error: unknown) => error);
    try {
      const request = await started.promise;
      expect(request.remainingTimeoutMs()).toBe(45_000);

      await vi.advanceTimersByTimeAsync(45_000);
      await expect(failure).resolves.toMatchObject({ status: 504 });

      expect(request.signal.aborted).toBe(true);
      expect(request.remainingTimeoutMs()).toBe(1);
    } finally {
      finish.resolve(undefined);
      await stopPrintRequests();
    }
  });

  it('checks an elapsed deadline before the timer callback runs', async () => {
    const result = withPrintRequest(
      createResponse(),
      async ({ signal, remainingTimeoutMs, throwIfAborted }) => {
        vi.setSystemTime(45_001);

        expect(remainingTimeoutMs()).toBe(1);
        expect(signal.aborted).toBe(false);
        throwIfAborted();
      },
    );

    await expect(result).rejects.toMatchObject({ status: 504 });
  });
});
