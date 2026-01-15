import { Router } from 'express';

import * as error from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';

import { pullAndUpdateCourse } from '../../../../lib/course.js';
import { JobSchema } from '../../../../lib/db-types.js';
import { typedAsyncHandler } from '../../../../lib/res-locals.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);
const router = Router({ mergeParams: true });

router.post(
  '/',
  typedAsyncHandler<'course'>(async (req, res) => {
    const { jobSequenceId } = await pullAndUpdateCourse({
      course: res.locals.course,
      userId: res.locals.user.id,
      authnUserId: res.locals.authz_data.authn_user.id,
    });
    res.status(200).json({ job_sequence_id: jobSequenceId });
  }),
);

router.get(
  '/:job_sequence_id(\\d+)',
  typedAsyncHandler<'course'>(async (req, res) => {
    const result = await sqldb.queryOptionalRow(
      sql.select_job,
      {
        course_id: res.locals.course.id,
        job_sequence_id: req.params.job_sequence_id,
      },
      JobSchema.pick({
        job_sequence_id: true,
        start_date: true,
        finish_date: true,
        status: true,
        output: true,
      }),
    );

    if (!result) {
      throw new error.HttpStatusError(404, 'Job sequence not found');
    }

    res.status(200).json(result);
  }),
);

export default router;
