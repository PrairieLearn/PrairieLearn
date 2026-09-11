import { z } from 'zod';

import {
  CourseAgentTokenUsageSchema,
  CourseAgentUsageIdentitySchema,
} from '@prairielearn/course-agent-protocol';

import { type ProviderEnv, proxyOpenAiRequest } from './provider.js';

export interface UsageEnv extends ProviderEnv {
  COURSE_AGENT_CAPABILITY_SECRET: string;
  COURSE_AGENT_PL_ORIGIN?: string;
}

export async function signUsageToken(data: unknown, secret: string) {
  const encode = (value: string) =>
    btoa(value).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
  const encoded = encode(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(data))));
  const date = Date.now().toString(36);
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const bytes = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${date}.${encoded}`)),
  );
  const signature = encode([...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join(''));
  return `${signature}.${date}.${encoded}`;
}

const ProviderUsageSchema = z.object({
  input_tokens: z.number().int().nonnegative(),
  input_tokens_details: z
    .object({ cached_tokens: z.number().default(0), cache_write_tokens: z.number().default(0) })
    .nullish(),
  output_tokens: z.number().int().nonnegative(),
  output_tokens_details: z.object({ reasoning_tokens: z.number().default(0) }).nullish(),
});

export function normalizeProviderUsage(value: unknown) {
  const usage = ProviderUsageSchema.parse(value);
  return CourseAgentTokenUsageSchema.parse({
    input_tokens: usage.input_tokens,
    cache_read_tokens: usage.input_tokens_details?.cached_tokens ?? 0,
    cache_write_tokens: usage.input_tokens_details?.cache_write_tokens ?? 0,
    output_tokens: usage.output_tokens,
    reasoning_tokens: usage.output_tokens_details?.reasoning_tokens ?? 0,
  });
}

const ProviderResponseSchema = z.object({ usage: ProviderUsageSchema.nullish() });
const StreamEventSchema = z.object({
  type: z.string(),
  response: ProviderResponseSchema.optional(),
});

export async function meteredOpenAiRequest(
  request: Request,
  env: UsageEnv,
  identity: z.infer<typeof CourseAgentUsageIdentitySchema>,
  fetchImplementation: typeof fetch = fetch,
) {
  identity = CourseAgentUsageIdentitySchema.parse(identity);
  const url = new URL(request.url);
  if (request.headers.get('authorization') !== 'Bearer proxy-injected') {
    return new Response('Model-provider request is not permitted.', { status: 403 });
  }
  if (request.method === 'GET' && url.pathname === '/v1/models') {
    return proxyOpenAiRequest(request, env, fetchImplementation);
  }
  if (
    request.method !== 'POST' ||
    !['/v1/responses', '/v1/responses/compact'].includes(url.pathname)
  ) {
    return new Response('Model-provider request is not permitted.', { status: 403 });
  }
  if (!env.COURSE_AGENT_PL_ORIGIN) {
    return new Response('Course-agent PL origin is not configured.', { status: 503 });
  }
  const { model } = z
    .object({
      model: z.string().min(1).max(150),
      service_tier: z.enum(['auto', 'default']).optional(),
      background: z.literal(false).optional(),
    })
    .parse(await request.clone().json());
  const id = crypto.randomUUID();
  const callback = async (
    action: 'authorize' | 'record',
    usage: z.infer<typeof CourseAgentTokenUsageSchema> | null,
  ) => {
    const token = await signUsageToken(
      {
        type: 'course-agent-usage',
        ...identity,
        id,
        model,
        action,
        usage,
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      },
      env.COURSE_AGENT_CAPABILITY_SECRET,
    );
    return fetchImplementation(
      new URL('/pl/webhooks/course-agent-usage', env.COURSE_AGENT_PL_ORIGIN),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
        redirect: 'error',
        signal: AbortSignal.timeout(10000),
      },
    );
  };
  let authorized: Response;
  try {
    authorized = await callback('authorize', null);
  } catch {
    return new Response('Course-agent usage limits are unavailable. Try again later.', {
      status: 503,
    });
  }
  const limit = z
    .object({ allowed: z.boolean(), message: z.string().nullable().optional() })
    .safeParse(await authorized.json().catch(() => null));
  if (!authorized.ok || !limit.success || !limit.data.allowed) {
    return Response.json(
      {
        error: {
          message:
            limit.success && limit.data.message
              ? limit.data.message
              : 'Course-agent usage authorization failed. Check PL configuration.',
          type: 'usage_limit',
        },
      },
      { status: authorized.status === 429 ? 429 : 503 },
    );
  }
  const record = async (value: unknown) => {
    const usage = normalizeProviderUsage(value);
    // Retry only accounting, never the paid provider request. The receipt ID makes retries idempotent.
    for (let attempt = 0; attempt < 3; attempt++) {
      const result = await callback('record', usage).catch(() => null);
      if (result?.ok) {
        const saved = z
          .object({ allowed: z.literal(true) })
          .safeParse(await result.json().catch(() => null));
        if (saved.success) return;
      }
    }
    throw new Error('Could not save course-agent usage. Check PL before continuing.');
  };
  const response = await proxyOpenAiRequest(request, env, fetchImplementation);
  if (!response.ok || !response.body) return response;
  if (!response.headers.get('content-type')?.includes('text/event-stream')) {
    const payload = ProviderResponseSchema.parse(await response.clone().json());
    if (payload.usage) await record(payload.usage);
    return response;
  }
  let buffer = '';
  let recorded = false;
  const inspect = async (line: string) => {
    if (!line.startsWith('data:')) return;
    const raw = line.slice(5).trim();
    if (!raw || raw === '[DONE]') return;
    const event = StreamEventSchema.parse(JSON.parse(raw));
    if (
      !recorded &&
      ['response.completed', 'response.incomplete', 'response.failed'].includes(event.type) &&
      event.response?.usage
    ) {
      await record(event.response.usage);
      recorded = true;
    }
  };
  const body = response.body
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(
      new TransformStream<string, string>({
        async transform(chunk, controller) {
          buffer += chunk;
          let end: number;
          while ((end = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, end).replace(/\r$/, '');
            buffer = buffer.slice(end + 1);
            await inspect(line);
          }
          if (buffer.length > 8 * 1024 * 1024) {
            throw new Error('Provider event exceeds usage parser limit.');
          }
          controller.enqueue(chunk);
        },
        async flush() {
          if (buffer) await inspect(buffer);
        },
      }),
    )
    .pipeThrough(new TextEncoderStream());
  return new Response(body, { status: response.status, headers: response.headers });
}
