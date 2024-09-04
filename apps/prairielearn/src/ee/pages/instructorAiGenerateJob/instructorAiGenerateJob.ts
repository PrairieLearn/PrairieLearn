import * as express from 'express';
import asyncHandler from 'express-async-handler';

import * as error from '@prairielearn/error';
import { loadSqlEquiv, queryRow } from '@prairielearn/postgres';

import { JobSchema } from '../../../lib/db-types.js';

import { InstructorAiGenerateJob } from './instructorAiGenerateJob.html.js';

const router = express.Router({ mergeParams: true });
const sql = loadSqlEquiv(import.meta.url);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_permission_edit) {
      throw new error.HttpStatusError(403, 'Access denied (must be course editor)');
    }

    const job = await queryRow(
      sql.select_generation_job,
      { course_id: res.locals.course.id, job_sequence_id: req.params.job_sequence_id },
      JobSchema,
    );
    res.send(InstructorAiGenerateJob({ resLocals: res.locals, job }));
  }),
);

export default router;
