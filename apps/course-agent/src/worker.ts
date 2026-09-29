// Public entry point: authenticate and route to the named conversation DO.
import { ContainerProxy } from '@cloudflare/sandbox';
import { routeAgentRequest } from 'agents';

import type { Env } from './agent.js';

export { Chat } from './agent.js';
export { Sandbox } from './sandbox.js';
export { ContainerProxy };

export default {
  async fetch(request, env) {
    // Only the chat is public; the Sandbox binding is an internal execution API.
    if (!new URL(request.url).pathname.startsWith('/agents/chat/')) {
      return new Response('Not found', { status: 404 });
    }
    if (
      !env.PL_SERVICE_TOKEN ||
      request.headers.get('Authorization') !== `Bearer ${env.PL_SERVICE_TOKEN}`
    ) {
      return new Response('PL authentication required', { status: 401 });
    }
    // CORS covers history requests; WebSocket upgrades need an origin check too.
    const origin = request.headers.get('Origin');
    if (origin && origin !== env.UI_ORIGIN) {
      return new Response('Origin not allowed', { status: 403 });
    }
    return (
      (await routeAgentRequest(request, env, {
        cors: {
          'Access-Control-Allow-Origin': env.UI_ORIGIN,
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          Vary: 'Origin',
        },
      })) ?? new Response('Not found', { status: 404 })
    );
  },
} satisfies ExportedHandler<Env>;
