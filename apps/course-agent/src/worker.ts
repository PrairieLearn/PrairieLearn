import { ContainerProxy } from '@cloudflare/sandbox';
import { getAgentByName } from 'agents';

import { readServiceBody, verifyServiceRequest } from '@prairielearn/course-agent-contract';

import type { Env } from './agent.js';

export { Chat } from './agent.js';
export { Sandbox } from './sandbox.js';
export { ContainerProxy };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const apiOrigin = URL.canParse(env.PL_API_ORIGIN ?? '') ? new URL(env.PL_API_ORIGIN!) : null;
    if (
      !env.CODEX_MODEL ||
      !env.PL_SERVICE_TOKEN ||
      env.PL_SERVICE_TOKEN.length < 32 ||
      !apiOrigin ||
      apiOrigin.username ||
      apiOrigin.password ||
      (apiOrigin.protocol !== 'https:' &&
        !(env.LOCAL_DEV === 'true' && apiOrigin.protocol === 'http:'))
    ) {
      return Response.json(
        {
          code: 'unconfigured',
          message: 'Agent service is not fully configured.',
          retryable: false,
          requestId: crypto.randomUUID(),
        },
        { status: 503 },
      );
    }
    if (!url.pathname.startsWith('/v1/')) return new Response('Not found', { status: 404 });
    if (Number(request.headers.get('Content-Length') ?? 0) > 3_000_000) {
      return new Response('Request too large', { status: 413 });
    }
    let body: string;
    try {
      body = request.method === 'GET' ? '' : await readServiceBody(request.clone());
    } catch {
      return new Response('Request too large', { status: 413 });
    }
    if (body.length > 3_000_000) return new Response('Request too large', { status: 413 });
    const scope = await verifyServiceRequest(
      request,
      env.PL_SERVICE_TOKEN ?? '',
      'agent-api',
      body,
    );
    if (!scope) return new Response('Service authentication required', { status: 401 });
    if (url.pathname === '/v1/capabilities' && request.method === 'GET') {
      return Response.json({
        version: 1,
        model: env.CODEX_MODEL,
        features: [
          'history',
          'stream',
          'events',
          'cleanup',
          'export',
          'publication',
          'request-budget',
          'retention',
        ],
      });
    }
    const match =
      /^\/v1\/conversations\/([a-f0-9-]+)(?:\/(snapshot|runtime|diagnostics|events|stream|history|export|messages|stop|cleanup|retention))?$/.exec(
        url.pathname,
      );
    if (!match || match[1] !== scope.conversationId) {
      return new Response('Not found', { status: 404 });
    }
    const chat = await getAgentByName(env.Chat, scope.conversationId);
    // Preserve the signature: the DO authenticates the original request too.
    const response = await chat.fetch(request);
    if (response.status < 400) return response;
    const raw = await response.text();
    let message = raw;
    try {
      const parsed = JSON.parse(raw) as { error?: string; message?: string };
      message = parsed.message ?? parsed.error ?? raw;
    } catch {
      // Preserve the plain-text error when the response is not JSON.
    }
    return Response.json(
      {
        code:
          response.status === 429
            ? 'policy_refused'
            : response.status === 409
              ? 'conflict'
              : 'unavailable',
        message,
        retryable: response.status >= 500,
        requestId: crypto.randomUUID(),
      },
      { status: response.status },
    );
  },
} satisfies ExportedHandler<Env>;
