import { type Response as ExpressResponse, Router } from 'express';
import { z } from 'zod';

import { logger } from '@prairielearn/logger';
import { IdSchema, parseRequestBody, parseRequestParams } from '@prairielearn/zod';

import { extractPageContext } from '../../lib/client/page-context.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import { courseAgentEnabled } from '../lib/course-agent/access.js';
import {
  getCourseAgentChat,
  postCourseAgentChat,
  stopCourseAgentChat,
} from '../lib/course-agent/client.js';
import { pipeEventStream, pipeUiMessageStream } from '../lib/ui-message-stream.js';
import {
  selectOptionalCourseAgentConversation,
  updateCourseAgentConversationTitleIfDefault,
} from '../models/course-agent-conversation.js';

const router = Router({ mergeParams: true });
const ParamsSchema = z.object({
  course_id: IdSchema,
  conversation_id: IdSchema,
  action: z.enum(['chat', 'stop']),
});
const ChatPostBodySchema = z.object({
  message: z.object({
    role: z.literal('user'),
    parts: z.tuple([
      z.object({ type: z.literal('text'), text: z.string().trim().min(1).max(20_000) }),
    ]),
  }),
});
const StopPostBodySchema = z.object({ assistantMessageId: z.uuid() });

function sendError(res: ExpressResponse, status: number, text: string) {
  res.status(status).type('text').send(text);
}

router.all(
  '/conversations/:conversation_id/:action(chat|stop)',
  typedAsyncHandler<'course'>(async (req, res) => {
    const params = parseRequestParams(req, ParamsSchema);
    if (req.method !== 'POST' && !(req.method === 'GET' && params.action === 'chat')) {
      res.sendStatus(404);
      return;
    }
    // Validate all consumed request data before the catalog lookup.
    const message =
      req.method === 'POST' && params.action === 'chat'
        ? parseRequestBody(req, ChatPostBodySchema).message
        : null;
    const stop = params.action === 'stop' ? parseRequestBody(req, StopPostBodySchema) : null;
    if (!(await courseAgentEnabled(res.locals))) {
      sendError(res, 403, 'The course agent is not available in this course.');
      return;
    }
    const { authn_user, course } = extractPageContext(res.locals, {
      pageType: 'course',
      accessType: 'instructor',
    });
    const conversation = await selectOptionalCourseAgentConversation({
      id: params.conversation_id,
      course_id: params.course_id,
      user_id: authn_user.id,
    });
    if (!conversation) {
      sendError(res, 404, 'Conversation not found.');
      return;
    }
    if (message) {
      const title = message.parts[0].text.replaceAll(/\s+/g, ' ').trim();
      await updateCourseAgentConversationTitleIfDefault({
        id: conversation.id,
        title: title.length > 80 ? `${title.slice(0, 79)}…` : title,
      });
    }
    const abort = new AbortController();
    const close = () => abort.abort();
    res.once('close', close);
    try {
      const id = conversation.agent_conversation_id;
      const upstream = await (stop
        ? stopCourseAgentChat(id, stop.assistantMessageId, abort.signal)
        : message
          ? postCourseAgentChat({
              agentConversationId: id,
              message,
              context: { courseTitle: course.title ?? '', courseShortName: course.short_name },
              signal: abort.signal,
            })
          : getCourseAgentChat(id, abort.signal));
      if (stop && [202, 204].includes(upstream.status)) {
        res.sendStatus(upstream.status);
        return;
      }
      if (!upstream.ok || !upstream.body) {
        if (upstream.status === 409) {
          sendError(res, 409, 'The agent is still replying. Wait for it to finish, or stop it.');
        } else {
          logger.error(`Course agent service responded with ${upstream.status}`);
          sendError(res, 502, 'The course agent is unavailable. Please reconnect.');
        }
        return;
      }
      // A late upstream response can arrive after the browser has disconnected.
      res.removeListener('close', close);
      if (res.destroyed || res.writableEnded) {
        await upstream.body.cancel();
        return;
      }
      if (message) {
        const assistantId = upstream.headers.get('X-Assistant-Message-Id');
        if (assistantId) res.setHeader('X-Assistant-Message-Id', assistantId);
        await pipeUiMessageStream(upstream.body, res);
      } else {
        await pipeEventStream(upstream.body, res);
      }
    } catch (err) {
      const disconnected =
        err instanceof Error && 'code' in err && err.code === 'ERR_STREAM_PREMATURE_CLOSE';
      if (!abort.signal.aborted && !disconnected) {
        logger.error('Course agent service request failed', err);
        if (!res.headersSent) {
          sendError(res, 502, 'The course agent is unavailable. Please reconnect.');
        } else {
          res.destroy();
        }
      }
    } finally {
      res.removeListener('close', close);
      abort.abort();
    }
  }),
);

export default router;
