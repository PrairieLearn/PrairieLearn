import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import pg from 'pg';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';

import { COURSE_DATA_DATASETS, courseDataSchema, isCourseDataset } from './datasets.js';
import { selectCourseDatasetRowsQuery } from './query.js';

const router = Router({ mergeParams: true });

// Rows are serialized as they are; the dataset test checks their shape against each schema.
const RowSchema = z.custom<Record<string, unknown>>();

const SCHEMA = courseDataSchema();

// Caps how long a request can hold a connection, including time spent streaming rows. Shorter than
// the course agent's 120-second request timeout, so a slow query fails with a reason.
const QUERY_TIMEOUT_MS = 60_000;

router.get('/', (req, res) => {
  res.send(SCHEMA);
});

// A POST because the request is a JSON document; it only reads data.
router.post(
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
    // Unlike parseRequestBody's generic message, Zod's explains what is allowed, such as the
    // dataset's columns, so the course agent can correct its request.
    const body = dataset.querySchema.safeParse(req.body);
    if (!body.success) throw new HttpStatusError(400, z.prettifyError(body.error));

    const { rawSqlQuery, params } = selectCourseDatasetRowsQuery(dataset.query, body.data);
    const timeout = AbortSignal.timeout(QUERY_TIMEOUT_MS);
    const cursor = await sqldb.queryCursor(
      rawSqlQuery,
      { ...params, course_id: res.locals.course.id },
      RowSchema,
      { signal: timeout },
    );
    const batches = cursor.iterate(1000);
    // Fetch the first batch before responding, while an error can still be sent: a filter value
    // Postgres can't convert to its column's type (class 22, data exception), or the timeout.
    let first: IteratorResult<Record<string, unknown>[]>;
    try {
      first = await batches.next();
    } catch (err) {
      if (err instanceof pg.DatabaseError && err.code?.startsWith('22')) {
        throw new HttpStatusError(400, err.message);
      }
      if (timeout.aborted) {
        throw new HttpStatusError(
          400,
          `The query took longer than ${QUERY_TIMEOUT_MS / 1000} seconds. Add filters, such as course_instance_id or assessment_id.`,
        );
      }
      throw err;
    }
    const jsonl = (rows: Record<string, unknown>[]) =>
      rows.map((row) => `${JSON.stringify(row)}\n`).join('');
    res.type('application/x-ndjson');
    try {
      await pipeline(
        Readable.from(
          (async function* () {
            if (!first.done) yield jsonl(first.value);
            for await (const rows of batches) yield jsonl(rows);
          })(),
        ),
        res,
      );
    } finally {
      // If the response closes before the stream is first read, the generator above never runs
      // and so never closes the cursor, which would keep its database connection.
      await batches.return(undefined);
    }
  }),
);

export default router;
