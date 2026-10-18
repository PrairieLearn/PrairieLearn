import { type Response as ExpressResponse, Router } from 'express';
import { z } from 'zod';

import { logger } from '@prairielearn/logger';
import { IdSchema, parseRequest } from '@prairielearn/zod';

import { typedAsyncHandler } from '../../lib/res-locals.js';
import { courseAgentEnabled } from '../lib/course-agent/access.js';
import { postCourseAgentChat } from '../lib/course-agent/client.js';
import { pipeUiMessageStream } from '../lib/ui-message-stream.js';
import {
  selectOptionalCourseAgentConversation,
  updateCourseAgentConversationTitleIfDefault,
} from '../models/course-agent-conversation.js';

const router = Router({ mergeParams: true });

const TITLE_MAX_LENGTH = 80;

const PostRequestSchemas = {
  params: z.object({ course_id: IdSchema, conversation_id: IdSchema }),
  body: z.object({
    // `useChat` sends only the newest message; the history lives in the agent service.
    message: z.object({
      role: z.literal('user'),
      parts: z
        .array(z.object({ type: z.literal('text'), text: z.string().trim().min(1).max(20_000) }))
        .length(1),
    }),
  }),
};

function titleFromMessage(text: string) {
  const title = text.replaceAll(/\s+/g, ' ').trim();
  return title.length > TITLE_MAX_LENGTH ? `${title.slice(0, TITLE_MAX_LENGTH - 1)}…` : title;
}

function isPrematureClose(err: unknown) {
  return err instanceof Error && 'code' in err && err.code === 'ERR_STREAM_PREMATURE_CLOSE';
}

/** The AI SDK client shows the response body as the error, so errors are plain text. */
function sendError(res: ExpressResponse, status: number, text: string) {
  res.status(status).type('text').send(text);
}

router.post(
  '/conversations/:conversation_id/chat',
  typedAsyncHandler<'course'>(async (req, res) => {
    const { params, body } = parseRequest(req, PostRequestSchemas);

    if (!(await courseAgentEnabled(res.locals))) {
      sendError(res, 403, 'The course agent is not available in this course.');
      return;
    }

    const conversation = await selectOptionalCourseAgentConversation({
      id: params.conversation_id,
      course_id: params.course_id,
      user_id: res.locals.authn_user.id,
    });
    if (!conversation) {
      sendError(res, 404, 'Conversation not found.');
      return;
    }

    await updateCourseAgentConversationTitleIfDefault({
      id: conversation.id,
      title: titleFromMessage(body.message.parts[0].text),
    });

    const abort = new AbortController();
    let upstream: Response;
    try {
      upstream = await postCourseAgentChat({
        agentConversationId: conversation.agent_conversation_id,
        message: body.message,
        context: {
          courseTitle: res.locals.course.title ?? '',
          courseShortName: res.locals.course.short_name ?? '',
        },
        signal: abort.signal,
      });
    } catch (err) {
      logger.error('Course agent service request failed', err);
      sendError(res, 502, 'The course agent is unavailable. Please try again.');
      return;
    }

    if (!upstream.ok || !upstream.body) {
      // Never forward the service's error body, which may include internals.
      if (upstream.status === 409) {
        sendError(res, 409, 'The agent is still replying. Wait for it to finish, or stop it.');
      } else {
        logger.error(`Course agent service responded with ${upstream.status}`);
        sendError(res, 502, 'The course agent is unavailable. Please try again.');
      }
      return;
    }

    try {
      await pipeUiMessageStream(upstream.body, res);
    } catch (err) {
      // The browser closed the request (Stop, or navigating away). Cancel the
      // upstream request too. Stopping generation in the DO is not yet reliable.
      abort.abort();
      if (!isPrematureClose(err)) logger.error('Course agent stream failed', err);
    }
  }),
);

export default router;
