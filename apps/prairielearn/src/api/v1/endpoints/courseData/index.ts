import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { type ErrorRequestHandler, Router } from 'express';
import asyncHandler from 'express-async-handler';
import pg from 'pg';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';

import { COURSE_DATA_DATASETS, courseDataSchema, isCourseDataset } from './datasets.js';
import { buildCourseDataQuery } from './query.js';

const router = Router({ mergeParams: true });

const RowSchema = z.record(z.string(), z.unknown());

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.status(200).send(courseDataSchema());
  }),
);

router.get(
  '/:dataset',
  asyncHandler(async (req, res) => {
    const name = req.params.dataset;
    if (!isCourseDataset(name)) {
      throw new HttpStatusError(
        404,
        `Unknown dataset "${name}". Datasets: ${Object.keys(COURSE_DATA_DATASETS).join(', ')}.`,
      );
    }
    const dataset = COURSE_DATA_DATASETS[name];
    const { sql, params } = buildCourseDataQuery({
      block: dataset.query,
      columns: Object.keys(dataset.schema.shape),
      search: new URL(req.originalUrl, 'http://localhost').searchParams,
    });
    const cursor = await sqldb.queryCursor(
      sql,
      { ...params, course_id: res.locals.course.id },
      RowSchema,
    );
    const batches = cursor.iterate(1000);
    // Fetch the first batch before responding. A filter value Postgres can't convert to its
    // column's type (class 22, data exception) fails here, while a 400 can still be sent.
    let first: IteratorResult<Record<string, unknown>[]>;
    try {
      first = await batches.next();
    } catch (err) {
      if (err instanceof pg.DatabaseError && err.code?.startsWith('22')) {
        throw new HttpStatusError(400, err.message);
      }
      throw err;
    }
    res.type('application/x-ndjson');
    await pipeline(
      Readable.from(
        (async function* () {
          if (!first.done) yield* first.value;
          for await (const rows of batches) yield* rows;
        })(),
      ),
      new Transform({
        objectMode: true,
        transform(row, _encoding, callback) {
          callback(null, `${JSON.stringify(row)}\n`);
        },
      }),
      res,
    );
  }),
);

// The API's error handler replies with only the status text. Callers, including the course agent,
// need these messages to correct a request.
router.use(((err, req, res, next) => {
  if (err instanceof HttpStatusError && err.status < 500) {
    res.status(err.status).send({ message: err.message, status: err.status });
    return;
  }
  next(err);
}) satisfies ErrorRequestHandler);

export default router;
