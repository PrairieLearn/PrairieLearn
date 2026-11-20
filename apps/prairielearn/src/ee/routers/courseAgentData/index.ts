import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { type ErrorRequestHandler, Router } from 'express';

import { HttpStatusError } from '@prairielearn/error';

import { typedAsyncHandler } from '../../../lib/res-locals.js';
import { courseAgentEnabled } from '../../lib/course-agent/access.js';
import { selectCourseDatasetRows } from '../../lib/course-agent/course-data.js';

import { courseDataSchema } from './datasets.js';

const router = Router({ mergeParams: true });

const SCHEMA = courseDataSchema();

router.use(
  typedAsyncHandler<'course'>(async (req, res, next) => {
    if (!(await courseAgentEnabled(res.locals))) {
      throw new HttpStatusError(403, 'The course agent is not enabled for this course and user');
    }
    next();
  }),
);

router.get('/', (req, res) => {
  res.send(SCHEMA);
});

// A POST because the request is a JSON document; it only reads data.
router.post(
  '/:dataset',
  typedAsyncHandler<'course'>(async (req, res) => {
    const { rows, signal, close } = await selectCourseDatasetRows({
      course_id: res.locals.course.id,
      dataset: req.params.dataset,
      request: req.body,
    });
    res.type('application/x-ndjson');
    try {
      await pipeline(
        // One row per chunk, so the stream's read-ahead buffer holds a few rows, not batches.
        Readable.from(
          (async function* () {
            for await (const row of rows) yield `${JSON.stringify(row)}\n`;
          })(),
        ),
        res,
        // A client that stops reading would otherwise hold the cursor between reads, where the
        // query timeout can't reach it. Aborting the pipeline closes the cursor.
        { signal },
      );
    } finally {
      await close();
    }
  }),
);

/**
 * The course agent shows error messages to the model, so client errors we raise are sent as JSON:
 * their messages explain how to fix the request. Other errors may expose internals, so they go to
 * the default error handler.
 */
router.use(((err, req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }
  if (err instanceof HttpStatusError && err.status < 500) {
    res.status(err.status).send({ message: err.message });
    return;
  }
  next(err);
}) satisfies ErrorRequestHandler);

export default router;
