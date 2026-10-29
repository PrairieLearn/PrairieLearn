import { parseJsonEventStream } from 'ai';
import { z } from 'zod';

import { type UsageDelta, UsageDeltaSchema, emptyUsage } from '@prairielearn/course-agent-types';

// gpt-6-luna's fixed input/output prices. Cached input uses the input rate in this pilot.
const INPUT_MILLI_DOLLARS_PER_MILLION_TOKENS = 100;
const OUTPUT_MILLI_DOLLARS_PER_MILLION_TOKENS = 500;

const ModelEventSchema = z.looseObject({
  type: z.string(),
  response: z
    .looseObject({
      usage: z
        .looseObject({
          input_tokens: z.number().int().nonnegative(),
          output_tokens: z.number().int().nonnegative(),
          input_tokens_details: z
            .looseObject({ cached_tokens: z.number().int().nonnegative().optional() })
            .optional(),
          output_tokens_details: z
            .looseObject({ reasoning_tokens: z.number().int().nonnegative().optional() })
            .optional(),
        })
        .nullable()
        .optional(),
    })
    .optional(),
});

function requestUsage(event: z.infer<typeof ModelEventSchema>): UsageDelta | null {
  const usage = event.response?.usage;
  if (!usage) return null;
  return UsageDeltaSchema.parse({
    inputTokens: usage.input_tokens,
    cachedInputTokens: usage.input_tokens_details?.cached_tokens ?? 0,
    outputTokens: usage.output_tokens,
    reasoningTokens: usage.output_tokens_details?.reasoning_tokens ?? 0,
    costMilliDollars: Math.ceil(
      (usage.input_tokens * INPUT_MILLI_DOLLARS_PER_MILLION_TOKENS +
        usage.output_tokens * OUTPUT_MILLI_DOLLARS_PER_MILLION_TOKENS) /
        1_000_000,
    ),
  });
}

/** Observe provider usage before forwarding completion, even if the native reader disconnects. */
export async function observeModelUsage(
  response: Response,
  recordUsage: (usage: UsageDelta | null) => void,
) {
  if (!response.ok) {
    // These HTTP rejections did not admit generation. A transport/server failure is uncertain.
    if ([400, 401, 403, 404, 413, 422, 429].includes(response.status)) recordUsage(emptyUsage());
    else recordUsage(null);
    return { response, finished: Promise.resolve() };
  }
  if (!response.headers.get('Content-Type')?.includes('text/event-stream')) {
    const value: unknown = await response.json();
    const event = ModelEventSchema.parse({ type: 'response.completed', response: value });
    const usage = requestUsage(event);
    if (usage) recordUsage(usage);
    else recordUsage(null);
    return { response: Response.json(value), finished: Promise.resolve() };
  }
  if (!response.body) throw new Error('Provider returned no response stream');
  const reader = parseJsonEventStream({
    stream: response.body,
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
            recordUsage(usage);
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
      if (!settled) recordUsage(null);
    }
  })();
  const headers = new Headers(response.headers);
  headers.delete('Content-Length');
  headers.delete('Content-Encoding');
  return {
    response: new Response(stream, { headers, status: response.status }),
    finished,
  };
}
