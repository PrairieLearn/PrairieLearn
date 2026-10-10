import { z } from 'zod';

import {
  ChatError,
  type ModelGrant,
  type ModelSettlement,
  digestBody,
  readServiceBody,
} from '@prairielearn/course-agent-contract';

export interface ModelControl {
  stop?(message: string): Promise<void>;
  check(): Promise<void>;
  reserve(details: {
    model: string;
    requestDigest: string;
    inputTokenUpperBound: number;
    requestedMaxOutputTokens: number;
  }): Promise<ModelGrant>;
  dispatch(reservationId: string): Promise<boolean>;
  settle(input: ModelSettlement): Promise<void>;
}

// Runs in Cloudflare's outbound handlers, outside the Linux container. Sandbox
// commands can construct arbitrary HTTP requests, so every request is checked
// here before credentials are injected. Credentials never enter the checkout.
/** Inject the model credential outside the sandbox, only for the allowlisted inference endpoint. */
export async function forwardOpenAI(
  request: Request,
  env: { CODEX_API_KEY: unknown; CODEX_MODEL?: string },
  send: typeof fetch = fetch,
  control?: ModelControl,
): Promise<Response> {
  const url = new URL(request.url);
  if (
    url.origin !== 'http://openai.internal' ||
    request.method !== 'POST' ||
    !['/v1/responses', '/v1/responses/compact'].includes(url.pathname)
  ) {
    return new Response('Forbidden', { status: 403 });
  }
  if (typeof env.CODEX_API_KEY !== 'string' || !env.CODEX_API_KEY) {
    return new Response('Model credentials unavailable', { status: 503 });
  }
  if (!env.CODEX_MODEL) return new Response('Model is not configured', { status: 503 });
  let body: unknown;
  try {
    body = JSON.parse(await readServiceBody(request));
  } catch {
    return new Response('Invalid or oversized inference request', { status: 400 });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return new Response('Invalid inference request', { status: 400 });
  }
  if (!('model' in body) || body.model !== env.CODEX_MODEL) {
    return new Response('Model is not allowed', { status: 403 });
  }
  if (url.pathname.endsWith('/compact')) {
    const message =
      'This conversation reached its supported context limit. Start a new conversation; saved history remains available for export.';
    await control?.stop?.(message);
    return new Response(message, { status: 429 });
  }
  if (
    'conversation' in body ||
    'previous_response_id' in body ||
    'context_management' in body ||
    ('background' in body && body.background) ||
    ('service_tier' in body && body.service_tier !== 'default')
  ) {
    return new Response('Inference options are not allowed', { status: 403 });
  }
  // Provider-hosted search and code execution run outside our sandbox network policy.
  // Only function/custom tools, whose execution returns to Codex or PL, are allowed.
  if ('tools' in body) {
    if (!Array.isArray(body.tools)) return new Response('Invalid tools', { status: 400 });
    const allowed = body.tools.every(
      (tool: unknown) =>
        tool &&
        typeof tool === 'object' &&
        'type' in tool &&
        (tool.type === 'function' || tool.type === 'custom'),
    );
    if (!allowed) return new Response('Provider-hosted tools are not allowed', { status: 403 });
  }
  if ('tool_choice' in body && typeof body.tool_choice === 'object' && body.tool_choice !== null) {
    const choice = body.tool_choice;
    if (!('type' in choice) || !['function', 'custom'].includes(String(choice.type))) {
      return new Response('Tool choice is not allowed', { status: 403 });
    }
  }
  // Input counting only bounds inline text/tool data. Remote files and image
  // references can change between counting and inference, so fail closed.
  const remaining: unknown[] = [body];
  let items = 0;
  while (remaining.length > 0) {
    const value = remaining.pop();
    if (++items > 100_000) return new Response('Inference input is too complex', { status: 400 });
    if (!value || typeof value !== 'object') continue;
    if (Array.isArray(value)) {
      remaining.push(...value);
      continue;
    }
    if (
      ['input_image', 'input_file'].includes(String('type' in value ? value.type : '')) ||
      Object.keys(value).some((key) => ['image_url', 'file_url', 'file_id'].includes(key))
    ) {
      return new Response('Use inline text. Remote files and images have no verified cost bound.', {
        status: 403,
      });
    }
    remaining.push(...Object.values(value));
  }
  if (!control) return new Response('Budget service unavailable', { status: 503 });
  const headers = new Headers({
    'Content-Type': 'application/json',
    Accept: 'text/event-stream, application/json',
  });
  const upstream = new Request(`https://api.openai.com${url.pathname}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    redirect: 'manual',
  });
  upstream.headers.set('Authorization', `Bearer ${env.CODEX_API_KEY}`);
  // Do not let sandbox code select an unrelated billing project/organization.
  upstream.headers.delete('OpenAI-Organization');
  upstream.headers.delete('OpenAI-Project');
  let grant: ModelGrant | undefined;
  let dispatched = false;
  try {
    await control.check();
    // The approved implementation plan requires provider input counting before
    // paid inference. This uses the same provider and injected credential as
    // the existing Responses request; no live request is made during setup.
    const counted = { ...body };
    for (const key of ['stream', 'store', 'max_output_tokens', 'service_tier', 'stream_options']) {
      delete counted[key as keyof typeof counted];
    }
    const count = await send(
      new Request('https://api.openai.com/v1/responses/input_tokens', {
        method: 'POST',
        headers: upstream.headers,
        body: JSON.stringify(counted),
        redirect: 'manual',
        signal: AbortSignal.timeout(30_000),
      }),
    );
    if (!count.ok) {
      return new Response('Input counting failed. Model execution was not started.', {
        status: 503,
      });
    }
    const { input_tokens } = z
      .object({ input_tokens: z.number().int().nonnegative().max(1_000_000) })
      .parse(await count.json());
    const requested =
      'max_output_tokens' in body
        ? z.number().int().min(16).max(1_000_000).parse(body.max_output_tokens)
        : 8192;
    grant = await control.reserve({
      model: env.CODEX_MODEL,
      requestDigest: await digestBody(JSON.stringify(body)),
      inputTokenUpperBound: input_tokens,
      requestedMaxOutputTokens: requested,
    });
    const bounded = {
      ...body,
      max_output_tokens: grant.maxOutputTokens,
      store: false,
      service_tier: 'default',
    };
    if (!(await control.dispatch(grant.reservationId))) {
      await control.settle({ kind: 'not_sent', reservationId: grant.reservationId });
      return new Response('Execution authorization expired. Send a new message.', { status: 429 });
    }
    dispatched = true;
    const response = await send(
      new Request(upstream, {
        method: 'POST',
        body: JSON.stringify(bounded),
        signal: AbortSignal.timeout(Math.max(1, grant.expiresAt - Date.now())),
      }),
    );
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      return new Response('Model redirect blocked', { status: 502 });
    }
    const reservationId = grant.reservationId;
    const measured = (value: unknown): ModelSettlement | undefined => {
      const parsed = z
        .object({
          id: z.string().min(1),
          usage: z.object({
            input_tokens: z.number().int().nonnegative(),
            output_tokens: z.number().int().nonnegative(),
            input_tokens_details: z
              .object({ cached_tokens: z.number().int().nonnegative() })
              .optional(),
          }),
        })
        .safeParse(value);
      if (!parsed.success) return;
      return {
        kind: 'measured',
        reservationId,
        responseId: parsed.data.id,
        usage: {
          input: parsed.data.usage.input_tokens,
          cached: parsed.data.usage.input_tokens_details?.cached_tokens ?? 0,
          cacheWrite: 0,
          output: parsed.data.usage.output_tokens,
        },
      };
    };
    if (
      !response.body ||
      !(response.headers.get('Content-Type') ?? '').includes('text/event-stream')
    ) {
      await control.settle(
        measured(
          await response
            .clone()
            .json()
            .catch(() => null),
        ) ?? { kind: 'unknown', reservationId },
      );
      return response;
    }
    let pending = '';
    let usage: ModelSettlement | undefined;
    let bytes = 0;
    const decoder = new TextDecoder();
    const observer = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        controller.enqueue(chunk);
        bytes += chunk.byteLength;
        if (bytes > 16_000_000) throw new Error('Model response limit reached.');
        pending += decoder.decode(chunk, { stream: true }).replaceAll('\r\n', '\n');
        let end: number;
        while ((end = pending.indexOf('\n\n')) >= 0) {
          const frame = pending.slice(0, end);
          pending = pending.slice(end + 2);
          const data = frame
            .split('\n')
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).trim())
            .join('\n');
          if (!data || data === '[DONE]') continue;
          const event: unknown = JSON.parse(data);
          if (event && typeof event === 'object' && 'response' in event) {
            usage = measured(event.response) ?? usage;
          }
        }
        if (pending.length > 1_000_000) throw new Error('Model event limit reached.');
      },
      async flush() {
        await control.settle(usage ?? { kind: 'unknown', reservationId });
      },
    });
    return new Response(response.body.pipeThrough(observer), {
      status: response.status,
      headers: response.headers,
    });
  } catch (error) {
    if (grant) {
      await control.settle({
        kind: dispatched ? 'unknown' : 'not_sent',
        reservationId: grant.reservationId,
      });
    }
    if (error instanceof ChatError) {
      if (error.status === 429) await control.stop?.(error.message);
      return new Response(error.message, { status: error.status });
    }
    return new Response('Model request failed', { status: 502 });
  }
}

/** Allow repository reads with injected credentials; pushes require the trusted PL webserver approval path. */
export async function forwardGitHub(
  request: Request,
  env: { GITHUB_CLIENT_TOKEN?: string; repository: string },
  send: typeof fetch = fetch,
): Promise<Response> {
  const repo = env.repository;
  const url = new URL(request.url);
  if (
    !repo ||
    !/^[\w.-]+\/[\w.-]+$/.test(repo) ||
    !['https://github.com', 'http://github.com'].includes(url.origin)
  ) {
    return new Response('Forbidden', { status: 403 });
  }
  const discovery =
    request.method === 'GET' &&
    url.pathname === `/${repo}.git/info/refs` &&
    url.search === '?service=git-upload-pack';
  const upload =
    request.method === 'POST' && url.pathname === `/${repo}.git/git-upload-pack` && !url.search;
  if (!discovery && !upload) {
    return new Response('Only read-only Git access is allowed', {
      status: 403,
    });
  }
  if (!env.GITHUB_CLIENT_TOKEN) return new Response('Git credentials unavailable', { status: 503 });
  const headers = new Headers();
  headers.set('Authorization', `Basic ${btoa(`x-access-token:${env.GITHUB_CLIENT_TOKEN}`)}`);
  for (const name of ['content-type', 'accept', 'git-protocol', 'user-agent']) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  try {
    const result = await send(
      new Request(`https://github.com${url.pathname}${url.search}`, {
        method: request.method,
        headers,
        body: request.body,
        redirect: 'manual',
      }),
    );
    if (result.status >= 300 && result.status < 400) {
      await result.body?.cancel();
      return new Response('Git redirect blocked', { status: 502 });
    }
    return result;
  } catch {
    return new Response('Git request failed', { status: 502 });
  }
}
