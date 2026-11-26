import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { type ErrorRequestHandler, Router } from 'express';
import pg from 'pg';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';

import {
  CoursePageAuthzDataSchema,
  type InstructorCourseInstanceRole,
  hasRole,
} from '../../../lib/authz-data-lib.js';
import { type ResLocalsForPage, typedAsyncHandler } from '../../../lib/res-locals.js';
import {
  type CourseInstanceAuthz,
  selectCourseInstancesWithStaffAccess,
} from '../../../models/course-instances.js';
import { courseAgentEnabled, missingRoleMessage } from '../../lib/course-agent/access.js';

import { COURSE_DATA_DATASETS, courseDataSchema, isCourseDataset } from './datasets.js';
import { selectCourseDatasetRowsQuery } from './query.js';

const router = Router({ mergeParams: true });

// Rows are serialized as they are; the dataset test checks their shape against each schema.
const RowSchema = z.custom<Record<string, unknown>>();

const SCHEMA = courseDataSchema();

// Caps how long a request can hold a connection, including time spent streaming rows. Shorter than
// the course agent's 120-second request timeout, so a slow query fails with a reason.
const QUERY_TIMEOUT_MS = 60_000;

// Rows read from the database at a time. A row with a large column, such as a submitted answer,
// can be megabytes.
const BATCH_SIZE = 1000;
const LARGE_BATCH_SIZE = 10;

router.use(
  typedAsyncHandler<'course'>(async (req, res, next) => {
    if (!(await courseAgentEnabled(res.locals))) {
      throw new HttpStatusError(403, 'The course agent is not enabled for this course and user');
    }
    next();
  }),
);

/**
 * The course instances the user can see, each with their student data access, from the same query
 * the Issues page uses. Checked on every request, so a role removed during a conversation applies
 * to its next read.
 */
async function selectStaffCourseInstances(locals: ResLocalsForPage<'course'>) {
  return await selectCourseInstancesWithStaffAccess({
    course: locals.course,
    authzData: CoursePageAuthzDataSchema.parse(locals.authz_data),
  });
}

function hasCourseInstanceRole(ci: CourseInstanceAuthz, role: InstructorCourseInstanceRole) {
  return role === 'Student Data Editor'
    ? ci.has_course_instance_permission_edit
    : ci.has_course_instance_permission_view;
}

router.get(
  '/',
  typedAsyncHandler<'course'>(async (req, res) => {
    const courseInstances = await selectStaffCourseInstances(res.locals);
    res.send({
      ...SCHEMA,
      student_data_course_instances: courseInstances
        .filter((ci) => hasCourseInstanceRole(ci, 'Student Data Viewer'))
        .map((ci) => ci.short_name),
    });
  }),
);

// A POST because the request is a JSON document; it only reads data.
router.post(
  '/:dataset',
  typedAsyncHandler<'course'>(async (req, res) => {
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

    const { courseRole, courseInstanceRole } = dataset.requiredRoles;
    if (courseRole && !hasRole(res.locals.authz_data, [courseRole])) {
      throw new HttpStatusError(403, missingRoleMessage(courseRole));
    }
    let courseInstanceIds: string[] | null = null;
    if (courseInstanceRole) {
      const courseInstances = await selectStaffCourseInstances(res.locals);
      const permitted = courseInstances.filter((ci) =>
        hasCourseInstanceRole(ci, courseInstanceRole),
      );
      // A course with no course instances has no rows; refusing would blame a missing role.
      if (courseInstances.length > 0 && permitted.length === 0) {
        throw new HttpStatusError(403, missingRoleMessage(courseInstanceRole));
      }
      courseInstanceIds = permitted.map((ci) => ci.id);
    }

    const { rawSqlQuery, params } = selectCourseDatasetRowsQuery(dataset.query, body.data, {
      courseInstanceIds,
    });
    const timeout = AbortSignal.timeout(QUERY_TIMEOUT_MS);
    const cursor = await sqldb.queryCursor(
      rawSqlQuery,
      { ...params, course_id: res.locals.course.id },
      RowSchema,
      { signal: timeout },
    );
    const large = body.data.select.some((column) => dataset.largeColumns.has(column));
    const batches = cursor.iterate(large ? LARGE_BATCH_SIZE : BATCH_SIZE);
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
    res.type('application/x-ndjson');
    try {
      await pipeline(
        // One row per chunk, so the stream's read-ahead buffer holds a few rows, not batches.
        Readable.from(
          (async function* () {
            if (!first.done) for (const row of first.value) yield `${JSON.stringify(row)}\n`;
            for await (const rows of batches) {
              for (const row of rows) yield `${JSON.stringify(row)}\n`;
            }
          })(),
        ),
        res,
        // A client that stops reading would otherwise hold the cursor between reads, where the
        // query timeout can't reach it. Aborting the pipeline closes the cursor.
        { signal: timeout },
      );
    } finally {
      // If the response closes before the stream is first read, the generator above never runs
      // and so never closes the cursor, which would keep its database connection.
      await batches.return(undefined);
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
