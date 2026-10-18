import { type Response, Router } from 'express';
import { z } from 'zod';

import { IdSchema, parseRequest } from '@prairielearn/zod';

import { extractPageContext } from '../../lib/client/page-context.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import { courseAgentEnabled } from '../lib/course-agent/access.js';
import { connectCourseAgent } from '../lib/course-agent/socket.js';
import { selectOptionalCourseAgentConversation } from '../models/course-agent-conversation.js';

const router = Router({ mergeParams: true });
const EventsRequestSchemas = {
  params: z.object({ course_id: IdSchema, conversation_id: IdSchema }),
};
const ActivityRequestSchemas = {
  params: z.object({ course_id: IdSchema }),
  query: z.object({
    ids: z.preprocess(
      (value) => (typeof value === 'string' ? value.split(',') : value),
      z.array(IdSchema).min(1).max(50),
    ),
  }),
};

async function observe(
  res: Response,
  conversations: { id: string; agent_conversation_id: string }[],
  mode: 'full' | 'summary',
) {
  const abort = new AbortController();
  res.once('close', () => abort.abort());
  res.status(200).set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  res.write('retry: 1000\n\n');
  const heartbeat = setInterval(() => {
    if (!res.destroyed && !res.writableEnded) res.write(': keepalive\n\n');
  }, 15_000);
  heartbeat.unref();
  try {
    await Promise.all(
      conversations.map(async (conversation) => {
        const connection = await connectCourseAgent({
          conversationId: conversation.agent_conversation_id,
          signal: abort.signal,
          onClose: () => res.end(),
          onEvent: (event) => {
            if (res.destroyed || res.writableEnded) return;
            if (mode === 'summary') {
              if (event.event !== 'conversation.status_changed') return;
              res.write(
                `event: activity\ndata: ${JSON.stringify({ conversationId: conversation.id, summary: event.data })}\n\n`,
              );
            } else {
              res.write(`event: ${event.event}\ndata: ${JSON.stringify(event)}\n\n`);
            }
            // A slow observer can reconnect to a fresh snapshot; never let its
            // outgoing queue grow without bound or stall the agent's producer.
            if (res.writableLength > 8 * 1024 * 1024) {
              abort.abort();
              res.end();
            }
          },
        });
        await connection.command('conversation.subscribe', { mode });
      }),
    );
    await new Promise<void>((resolve) => {
      if (res.destroyed || res.writableEnded) resolve();
      else res.once('close', () => resolve());
    });
  } catch {
    res.end();
  } finally {
    clearInterval(heartbeat);
    abort.abort();
  }
}

router.get(
  '/conversations/:conversation_id/events',
  typedAsyncHandler<'course'>(async (req, res) => {
    const { params } = parseRequest(req, EventsRequestSchemas);
    if (!(await courseAgentEnabled(res.locals))) {
      res.sendStatus(403);
      return;
    }
    const { authn_user } = extractPageContext(res.locals, {
      pageType: 'course',
      accessType: 'instructor',
    });
    const conversation = await selectOptionalCourseAgentConversation({
      id: params.conversation_id,
      course_id: params.course_id,
      user_id: authn_user.id,
    });
    if (!conversation) {
      res.sendStatus(404);
      return;
    }
    await observe(res, [conversation], 'full');
  }),
);

router.get(
  '/activity',
  typedAsyncHandler<'course'>(async (req, res) => {
    const { params, query } = parseRequest(req, ActivityRequestSchemas);
    if (!(await courseAgentEnabled(res.locals))) {
      res.sendStatus(403);
      return;
    }
    const { authn_user } = extractPageContext(res.locals, {
      pageType: 'course',
      accessType: 'instructor',
    });
    const conversations = await Promise.all(
      [...new Set(query.ids)].map(async (id) =>
        selectOptionalCourseAgentConversation({
          id,
          course_id: params.course_id,
          user_id: authn_user.id,
        }),
      ),
    );
    // Authorize the entire bounded set before opening any service subscriptions.
    if (conversations.includes(null)) {
      res.sendStatus(404);
      return;
    }
    await observe(
      res,
      conversations.filter((conversation) => conversation !== null),
      'summary',
    );
  }),
);
export default router;
