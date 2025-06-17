import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import * as error from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';

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
    const result = await sqldb.queryAsync(sql.select_job, {
      course_id: req.params.course_id,
      job_sequence_id: req.params.job_sequence_id,
    });

    if (result.rowCount == null || result.rowCount === 0) {
      throw new error.HttpStatusError(404, 'Job sequence not found');
    }
    res.status(200).json(result.rows[0].item);
  }),
);

export default router;
