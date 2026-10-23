import { getAgentByName } from 'agents';

import { assertNever } from '@prairielearn/utils';

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
      // This waits for the SDK's lifecycle startup before returning the ID.
      await getAgentByName(env.Conversation, id);
      return Response.json({ id }, { status: 201 });
    }
    const route = parseRoute(request.url);
    if (!route) return new Response('Not found', { status: 404 });

    const conversation = await getAgentByName(env.Conversation, route.conversationId);
    // PrairieLearn checks conversation existence and ownership in its catalog
    // before forwarding requests. The service trusts its authenticated caller.
    switch (route.action) {
      case 'chat':
      case 'stop':
        return conversation.fetch(request);
      default:
        assertNever(route.action);
    }
  },
} satisfies ExportedHandler<Env>;
