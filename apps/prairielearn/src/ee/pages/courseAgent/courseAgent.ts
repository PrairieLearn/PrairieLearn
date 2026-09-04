import { JsonToSseTransformStream } from 'ai';
import { Router } from 'express';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import { parseRequestQuery } from '@prairielearn/zod';

import { typedAsyncHandler } from '../../../lib/res-locals.js';
import { getChatStreamContext } from '../../lib/chat/resumable-stream.js';
import { pipeUiMessageStream } from '../../lib/chat/sse.js';
import { getEphemeralCourseAgentSnapshot } from '../../lib/course-agent/ephemeral-runtime.js';
import { publicCourseAgentEvent } from '../../lib/course-agent/public-events.js';
import { getCourseAgentStreamId } from '../../lib/course-agent/redis.js';
import { courseAgentUIStream } from '../../lib/course-agent/ui-stream.js';

const router = Router({ mergeParams: true });

const StreamQuerySchema = z.object({
  runId: z.uuid(),
  conversationId: z.uuid(),
  sandboxId: z.string().min(1),
});

router.get(
  '/stream',
  typedAsyncHandler<'course'>(async (req, res) => {
    if (!res.locals.course_agent_enabled) {
      throw new error.HttpStatusError(403, 'Course agent is not enabled');
    }
    const { runId, conversationId, sandboxId } = parseRequestQuery(req, StreamQuerySchema);
    const streamContext = await getChatStreamContext();
    let stream = await streamContext.resumeExistingStream(
      getCourseAgentStreamId({
        courseId: res.locals.course.id,
        userId: res.locals.authn_user.id,
        runId,
      }),
      0,
    );
    if (!stream) {
      const snapshot = await getEphemeralCourseAgentSnapshot({
        courseId: res.locals.course.id,
        userId: res.locals.authn_user.id,
        conversationId,
        sandboxId,
      });
      stream = new ReadableStream({
        start(controller) {
          for (const event of snapshot.events) {
            const projected = publicCourseAgentEvent(event);
            if (projected) controller.enqueue(projected);
          }
          controller.close();
        },
      })
        .pipeThrough(courseAgentUIStream(runId))
        .pipeThrough(new JsonToSseTransformStream());
    }
    await pipeUiMessageStream(stream, res);
  }),
);

export default router;
