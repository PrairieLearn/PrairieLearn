import { getAgentByName } from 'agents';

import { CreateConversationInput, ReviewOutcomeSchema } from '@prairielearn/course-agent-types';

import { isAuthorized } from './http/auth.js';
import { parseRoute } from './http/routes.js';

export { DirectoryBackupGateway } from '@cloudflare/sandbox';
export { CourseSandbox, CourseAgentOutbound } from './sandbox.js';
export { Conversation } from './conversation/conversation.js';

export default {
  async fetch(request, env) {
    if (!isAuthorized(request.headers.get('Authorization'), env.PL_SERVICE_TOKEN)) {
      return new Response('Unauthorized', { status: 401 });
    }
    if (request.method === 'POST' && new URL(request.url).pathname === '/conversations') {
      const input = CreateConversationInput.safeParse(await request.json().catch(() => null));
      if (!input.success) return new Response('Invalid request', { status: 400 });
      const id = crypto.randomUUID();
      const conversation = await getAgentByName(env.Conversation, id);
      await conversation.initialize(input.data);
      return Response.json({ id }, { status: 201 });
    }
    const route = parseRoute(request.url);
    if (!route) return new Response('Not found', { status: 404 });
    // PL's catalog is the existence/ownership authority. Both SDK routes are
    // reachable only through its authenticated proxy.
    const conversation = await getAgentByName(env.Conversation, route.conversationId);
    if (route.action === 'pending-review' && request.method === 'GET') {
      return Response.json(await conversation.getPendingReview());
    }
    if (route.action === 'pending-review/outcome' && request.method === 'POST') {
      const outcome = ReviewOutcomeSchema.safeParse(await request.json().catch(() => null));
      if (!outcome.success) return new Response('Invalid outcome', { status: 400 });
      try {
        if (!(await conversation.recordReviewOutcome(outcome.data))) {
          return new Response('Review has changed', { status: 409 });
        }
        return Response.json({ outcomeRecorded: true });
      } catch (error) {
        console.error(error);
        return new Response('Could not incorporate review result', { status: 503 });
      }
    }
    if (!['chat', 'get-messages', 'resume'].includes(route.action)) {
      return new Response('Not found', { status: 404 });
    }
    if (route.action === 'resume' && request.method === 'POST') {
      try {
        if (!(await conversation.resume())) {
          return Response.json(
            { error: 'Conversation is not blocked or is already recovering' },
            { status: 409 },
          );
        }
        return Response.json({ recovered: true });
      } catch (error) {
        console.error(error);
        return Response.json({ error: 'Could not recover workspace' }, { status: 503 });
      }
    }
    if (route.action === 'resume' || request.method !== 'GET') {
      return new Response('Not found', { status: 404 });
    }
    return conversation.fetch(request);
  },
} satisfies ExportedHandler<Env>;
