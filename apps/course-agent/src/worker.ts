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
    // Chat is served over HTTP only; the SDK's WebSocket protocol is not exposed.
    if (request.headers.get('Upgrade')) {
      return new Response('WebSocket connections are not supported', { status: 426 });
    }
    if (request.method === 'POST' && new URL(request.url).pathname === '/conversations') {
      const id = crypto.randomUUID();
      const conversation = await getAgentByName(env.Conversation, id);
      // Finish durable initialization before exposing the ID to the caller.
      await conversation.initialize();
      return Response.json({ id }, { status: 201 });
    }
    const route = parseRoute(request.url);
    if (!route) return new Response('Not found', { status: 404 });

    const conversation = await getAgentByName(env.Conversation, route.conversationId);
    // Looking up a DO can instantiate it, even when no conversation was created.
    // Gate both chat and the SDK's history route on the persisted creation marker.
    if (!(await conversation.isInitialized())) {
      return new Response('Conversation not found', { status: 404 });
    }
    if (route.action === 'messages') {
      if (request.method !== 'GET') return new Response('Not found', { status: 404 });
      // Served by `AIChatAgent`'s built-in history route.
      return conversation.fetch(new Request(new URL('/get-messages', request.url), request));
    }
    return conversation.fetch(request);
  },
} satisfies ExportedHandler<Env>;
