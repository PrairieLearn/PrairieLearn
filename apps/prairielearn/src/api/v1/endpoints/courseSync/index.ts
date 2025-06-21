import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import * as error from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';

import { JobSchema } from '../../../../lib/db-types.js';
import * as syncHelpers from '../../../../pages/shared/syncHelpers.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);
const router = Router({ mergeParams: true });

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const jobSequenceId = await syncHelpers.pullAndUpdate(res.locals);
    res.status(200).json({ job_sequence_id: jobSequenceId });
  }),
);

router.get(
  '/:job_sequence_id(\\d+)',
  asyncHandler(async (req, res) => {
    const result = await sqldb.queryOptionalRow(
      sql.select_job,
      {
        course_id: req.params.course_id,
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
