import { getAgentByName } from 'agents';

import { isAuthorized } from './auth.js';
import type { Env } from './conversation.js';
import { parseRoute } from './routes.js';

export { Conversation } from './conversation.js';

export default {
  async fetch(request, env) {
    if (!isAuthorized(request.headers.get('Authorization'), env.PL_SERVICE_TOKEN)) {
      return new Response('Unauthorized', { status: 401 });
    }
    // Chat is served over HTTP only; the SDK's WebSocket protocol is not exposed.
    if (request.headers.get('Upgrade')) {
      return new Response('WebSocket connections are not supported', { status: 426 });
    }
    const route = parseRoute(new URL(request.url).pathname);
    if (!route) return new Response('Not found', { status: 404 });

    // The Durable Object is created on first access, so PrairieLearn never
    // needs a separate "create conversation" call.
    const conversation = await getAgentByName(env.Conversation, route.conversationId);
    return conversation.fetch(request);
  },
} satisfies ExportedHandler<Env>;
