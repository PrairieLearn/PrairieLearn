import pg from 'pg';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';

import { COURSE_DATA_DATASETS, isCourseDataset } from '../../routers/courseAgentData/datasets.js';
import { selectCourseDatasetRowsQuery } from '../../routers/courseAgentData/query.js';

// Rows are serialized as they are; the dataset test checks their shape against each schema.
const RowSchema = z.custom<Record<string, unknown>>();

// Caps how long a request can hold a connection, including time spent streaming rows. Shorter than
// the course agent's 120-second request timeout, so a slow query fails with a reason.
const QUERY_TIMEOUT_MS = 60_000;

// Rows read from the database at a time. A row with a large column, such as a submitted answer,
// can be megabytes.
const BATCH_SIZE = 1000;
const LARGE_BATCH_SIZE = 10;

/**
 * Starts reading rows of one course dataset. `request` is the caller's unvalidated query. A
 * request the caller can fix is refused with a 4xx `HttpStatusError` whose message says how,
 * because the callers show it to a model.
 *
 * The caller must call `close()` when done, even if it never reads `rows`, to release the
 * database connection. Abort a consumer that stalls with `signal`, which fires at the timeout.
 */
export async function selectCourseDatasetRows({
  course_id,
  dataset: name,
  request,
}: {
  course_id: string;
  dataset: string;
  request: unknown;
}): Promise<{
  rows: AsyncGenerator<Record<string, unknown>>;
  signal: AbortSignal;
  close: () => Promise<void>;
}> {
  if (!isCourseDataset(name)) {
    throw new HttpStatusError(
      404,
      `Unknown dataset "${name}". Datasets: ${Object.keys(COURSE_DATA_DATASETS).join(', ')}.`,
    );
  }
  const dataset = COURSE_DATA_DATASETS[name];
  // Unlike parseRequestBody's generic message, Zod's explains what is allowed, such as the
  // dataset's columns, so the caller can correct its request.
  const query = dataset.querySchema.safeParse(request);
  if (!query.success) throw new HttpStatusError(400, z.prettifyError(query.error));

  const { rawSqlQuery, params } = selectCourseDatasetRowsQuery(dataset.query, query.data);
  const signal = AbortSignal.timeout(QUERY_TIMEOUT_MS);
  const cursor = await sqldb.queryCursor(rawSqlQuery, { ...params, course_id }, RowSchema, {
    signal,
  });
  const large = query.data.select.some((column) => dataset.largeColumns.has(column));
  const batches = cursor.iterate(large ? LARGE_BATCH_SIZE : BATCH_SIZE);
  // Fetch the first batch before returning, while an error can still be reported: a filter value
  // Postgres can't convert to its column's type (class 22, data exception), or the timeout.
  let first: IteratorResult<Record<string, unknown>[]>;
  try {
    first = await batches.next();
  } catch (err) {
    if (err instanceof pg.DatabaseError && err.code?.startsWith('22')) {
      throw new HttpStatusError(400, err.message);
    }
    if (signal.aborted) {
      throw new HttpStatusError(
        400,
        `The query took longer than ${QUERY_TIMEOUT_MS / 1000} seconds. Add filters, such as course_instance_id or assessment_id.`,
      );
    }
    throw err;
  }
  return {
    rows: (async function* () {
      if (!first.done) yield* first.value;
      for await (const rows of batches) yield* rows;
    })(),
    signal,
    // If the rows are never read, the generator above never runs and so never closes the cursor,
    // which would keep its database connection.
    close: async () => {
      await batches.return(undefined);
    },
  };
}
