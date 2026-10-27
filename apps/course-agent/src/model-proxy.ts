import { parseJsonEventStream } from 'ai';

import { type UsageDelta, emptyUsage } from '@prairielearn/course-agent-types';

import { ModelEventSchema, requestUsage } from './model-usage.js';

/** Consume independently of the native reader, and persist usage before releasing completion. */
export async function proxyModelResponse(
  request: Request,
  {
    key,
    signal,
    settle,
    missingUsage,
  }: {
    key: string;
    signal: AbortSignal;
    settle: (usage: UsageDelta) => void;
    missingUsage: () => void;
  },
) {
  const upstream = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: request.body,
    signal,
    redirect: 'manual',
  });
  if (!upstream.ok) {
    // These HTTP rejections did not admit generation. A transport/server failure is uncertain.
    if ([400, 401, 403, 404, 413, 422, 429].includes(upstream.status)) settle(emptyUsage());
    else missingUsage();
    return { response: upstream, finished: Promise.resolve() };
  }
  if (!upstream.headers.get('Content-Type')?.includes('text/event-stream')) {
    const value: unknown = await upstream.json();
    const event = ModelEventSchema.parse({ type: 'response.completed', response: value });
    const usage = requestUsage(event);
    if (usage) settle(usage);
    else missingUsage();
    return { response: Response.json(value), finished: Promise.resolve() };
  }
  if (!upstream.body) throw new Error('Provider returned no response stream');
  const reader = parseJsonEventStream({
    stream: upstream.body,
    schema: ModelEventSchema,
  }).getReader();
  let downstream!: ReadableStreamDefaultController<Uint8Array>;
  let cancelled = false;
  let settled = false;
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      downstream = controller;
    },
    cancel() {
      cancelled = true;
    },
  });
  const finished = (async () => {
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        if (!chunk.value.success) throw new Error('Invalid provider stream');
        const event = chunk.value.value;
        if (
          ['response.completed', 'response.incomplete', 'response.failed'].includes(event.type) &&
          !settled
        ) {
          const usage = requestUsage(event);
          if (usage) {
            settle(usage);
            settled = true;
          }
        }
        if (!cancelled) {
          downstream.enqueue(
            encoder.encode(
              `event: ${event.type}\ndata: ${JSON.stringify(chunk.value.rawValue)}\n\n`,
            ),
          );
        }
      }
      if (!cancelled) downstream.close();
    } catch (error) {
      if (!cancelled) downstream.error(error);
    } finally {
      reader.releaseLock();
      if (!settled) missingUsage();
    }
  })();
  const headers = new Headers(upstream.headers);
  headers.delete('Content-Length');
  headers.delete('Content-Encoding');
  return {
    response: new Response(stream, { headers, status: upstream.status }),
    finished,
  };
}
