import { afterEach, expect, it, vi } from 'vitest';

import { proxyModelResponse } from './model-proxy.js';

const completion = {
  type: 'response.completed',
  response: {
    usage: {
      input_tokens: 10000,
      output_tokens: 2000,
      input_tokens_details: { cached_tokens: 8000 },
      output_tokens_details: { reasoning_tokens: 500 },
    },
  },
};
const encode = (event: unknown) => new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
const request = () =>
  new Request('https://model.internal/v1/responses', { method: 'POST', body: '{}' });
afterEach(() => vi.unstubAllGlobals());

it('settles provider usage before forwarding completion to the native runtime', async () => {
  const settle = vi.fn();
  const missingUsage = vi.fn();
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(encode({ type: 'response.output_text.delta', delta: 'Hello' }));
              controller.enqueue(encode(completion));
              controller.close();
            },
          }),
          { headers: { 'Content-Type': 'text/event-stream' } },
        ),
    ),
  );
  const result = await proxyModelResponse(request(), {
    key: 'test',
    signal: new AbortController().signal,
    settle,
    missingUsage,
  });
  const reader = result.response.body!.getReader();
  await reader.read();
  const chunk = await reader.read();
  expect(new TextDecoder().decode(chunk.value)).toContain('response.completed');
  expect(settle).toHaveBeenCalledExactlyOnceWith({
    inputTokens: 10000,
    cachedInputTokens: 8000,
    outputTokens: 2000,
    reasoningTokens: 500,
    costMilliDollars: 2,
  });
  await result.finished;
  expect(missingUsage).not.toHaveBeenCalled();
});

it('continues accounting when the downstream reader disconnects', async () => {
  let upstream!: ReadableStreamDefaultController<Uint8Array>;
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              upstream = controller;
            },
          }),
          { headers: { 'Content-Type': 'text/event-stream' } },
        ),
    ),
  );
  const settle = vi.fn();
  const missingUsage = vi.fn();
  const result = await proxyModelResponse(request(), {
    key: 'test',
    signal: new AbortController().signal,
    settle,
    missingUsage,
  });
  await result.response.body!.cancel();
  upstream.enqueue(encode(completion));
  upstream.close();
  await result.finished;
  expect(settle).toHaveBeenCalledOnce();
  expect(missingUsage).not.toHaveBeenCalled();
});

it('marks an interrupted stream without usage as unresolved instead of inventing a charge', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response('data: {"type":"response.output_text.delta","delta":"Hello"}\n\n', {
          headers: { 'Content-Type': 'text/event-stream' },
        }),
    ),
  );
  const settle = vi.fn();
  const missingUsage = vi.fn();
  const result = await proxyModelResponse(request(), {
    key: 'test',
    signal: new AbortController().signal,
    settle,
    missingUsage,
  });
  await result.response.text();
  await result.finished;
  expect(settle).not.toHaveBeenCalled();
  expect(missingUsage).toHaveBeenCalledOnce();
});
