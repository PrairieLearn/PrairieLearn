import { getAgentByName } from 'agents';

import { isAuthorized } from './http/auth.js';
import { parseRoute } from './http/routes.js';

export { Conversation } from './conversation/conversation.js';

export default {
  async fetch(request, env) {
    if (!isAuthorized(request.headers.get('Authorization'), env.PL_SERVICE_TOKEN)) {
      return new Response('Unauthorized', { status: 401 });
    }
    if (request.method === 'POST' && new URL(request.url).pathname === '/conversations') {
      const id = crypto.randomUUID();
      await getAgentByName(env.Conversation, id);
      return Response.json({ id }, { status: 201 });
    }
    const id = parseRoute(request.url);
    if (!id || request.method !== 'GET') return new Response('Not found', { status: 404 });
    // PL's catalog is the existence/ownership authority. Both SDK routes are
    // reachable only through its authenticated proxy.
    const conversation = await getAgentByName(env.Conversation, id);
    return conversation.fetch(request);
  },
} satisfies ExportedHandler<Env>;
