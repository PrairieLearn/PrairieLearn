import * as express from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import { JobSchema } from '../../../lib/db-types.js';

import { AiGenerateJobReviewpage } from './instructorAiGenerateJobReview.html.js';

const router = express.Router();
const sql = loadSqlEquiv(import.meta.url);

const JobWithUserEmailSchema = JobSchema.extend({
  email: z.string().nullable().optional(),
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_permission_edit) {
      throw new error.HttpStatusError(403, 'Access denied (must be course editor)');
    }

    const jobs = await queryRows(
      sql.select_generation_sequence_by_course,
      { course_id: res.locals.course.id },
      JobWithUserEmailSchema,
    );

    res.send(AiGenerateJobReviewpage({ resLocals: res.locals, jobs }));
  }),
);

export default router;
