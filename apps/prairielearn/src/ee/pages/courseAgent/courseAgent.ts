import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';

import { Router } from 'express';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import { parseRequestQuery } from '@prairielearn/zod';

import { typedAsyncHandler } from '../../../lib/res-locals.js';
import {
  getCourseAgentStreamContext,
  getCourseAgentStreamId,
} from '../../lib/course-agent/redis.js';

const router = Router({ mergeParams: true });

const StreamQuerySchema = z.object({
  runId: z.uuid(),
  offset: z.coerce.number().int().nonnegative().default(0),
});

router.get(
  '/stream',
  typedAsyncHandler<'course'>(async (req, res) => {
    if (!res.locals.course_agent_enabled) {
      throw new error.HttpStatusError(403, 'Course agent is not enabled');
    }
    const { runId, offset } = parseRequestQuery(req, StreamQuerySchema);
    const streamContext = await getCourseAgentStreamContext();
    const stream = await streamContext.resumeExistingStream(
      getCourseAgentStreamId({
        courseId: res.locals.course.id,
        userId: res.locals.authn_user.id,
        runId,
      }),
      offset,
    );
    if (!stream) {
      res.status(204).send();
      return;
    }
    res.set({
      'Cache-Control': 'no-cache, no-transform',
      'Content-Type': 'text/event-stream',
      'X-Accel-Buffering': 'no',
    });
    await pipeline(Readable.fromWeb(stream as unknown as NodeReadableStream<string>), res);
  }),
);

export default router;
