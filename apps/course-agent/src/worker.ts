import { getAgentByName } from 'agents';

import type { Env } from './env.js';
import { isAuthorized } from './http/auth.js';
import { parseRoute } from './http/routes.js';

export { Conversation } from './conversation/conversation.js';

export default {
  async fetch(request, env) {
    if (!isAuthorized(request.headers.get('Authorization'), env.PL_SERVICE_TOKEN)) {
      return new Response('Unauthorized', { status: 401 });
    }
    try {
      if (request.method === 'POST' && new URL(request.url).pathname === '/conversations') {
        const id = crypto.randomUUID();
        // This waits for the SDK's lifecycle startup before returning the ID.
        await getAgentByName(env.Conversation, id);
        return Response.json({ id }, { status: 201 });
      }
      const route = parseRoute(request.url);
      if (!route) return new Response('Not found', { status: 404 });

      const conversation = await getAgentByName(env.Conversation, route.conversationId);
      // PrairieLearn checks conversation existence and ownership in its catalog
      // before forwarding requests. The service trusts its authenticated caller.
      if (
        route.action === 'socket' &&
        request.method === 'GET' &&
        request.headers.get('Upgrade')?.toLowerCase() === 'websocket'
      ) {
        return conversation.fetch(request);
      }
      if (route.action === 'snapshot' && request.method === 'GET') {
        const before = new URL(request.url).searchParams.get('before') ?? undefined;
        return Response.json(await conversation.snapshot(before));
      }
      return new Response('Not found', { status: 404 });
    } catch {
      // Invalid/newer stored state and startup failures must not leak SDK internals.
      return new Response('The conversation is unavailable', { status: 503 });
    }
  },
} satisfies ExportedHandler<Env>;
