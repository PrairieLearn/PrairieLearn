import { afterEach, expect, test, vi } from 'vitest';

import { createCloudflareProvider } from './provider.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test('prompt acceptance honors the caller deadline during a cold sandbox restore', async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    'fetch',
    vi.fn(
      (_url: string, options: RequestInit) =>
        new Promise<Response>((resolve, reject) => {
          options.signal!.addEventListener('abort', () => reject(options.signal!.reason), {
            once: true,
          });
          setTimeout(() => resolve(new Response('{}')), 45_000);
        }),
    ),
  );
  const controller = new AbortController();
  const chat = createCloudflareProvider(new URL('http://localhost:8791'), 'test');
  const sending = chat.send(
    { id: crypto.randomUUID(), text: 'Hello', expectedOperationNumber: 0 },
    controller.signal,
  );
  await vi.advanceTimersByTimeAsync(45_000);
  await sending;
  expect(controller.signal.aborted).toBe(false);
});

// A malformed receipt must not become an acknowledgment that releases a PL admission.
test('rejects malformed Worker receipts at the JSON boundary', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      Response.json({
        messages: [],
        operationNumber: 0,
        executions: { invalid: { status: 'finished' } },
      }),
    ),
  );
  const chat = createCloudflareProvider(new URL('http://localhost:8791'), 'test');
  await expect(chat.getSnapshot(AbortSignal.timeout(1000))).rejects.toThrow();
});
