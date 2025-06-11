import * as express from 'express';
import asyncHandler from 'express-async-handler';

import * as sqldb from '@prairielearn/postgres';

import * as syncHelpers from '../../../../pages/shared/syncHelpers.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);
const router = express.Router({ mergeParams: true });

router.post(
  '/',
  asyncHandler(async (req, res) => {
    res.locals.course = {
      ...(res.locals.course || {}),
      id: req.params.course_id,
    };

    const jobSequenceId = await syncHelpers.pullAndUpdate(res.locals);
    res.status(200).json({ job_sequence_id: jobSequenceId });
  }),
);

router.get(
  '/:job_sequence_id',
  asyncHandler(async (req, res) => {
    const result = await sqldb.queryOneRowAsync(sql.select_job, {
      course_id: req.params.course_id,
      job_sequence_id: req.params.job_sequence_id,
    });

    const data = result.rows[0].item;

    if (data.length === 0) {
      res.status(404).send({ message: 'Not Found' });
    } else {
      res.status(200).send(data[0]);
    }
  }),
);

export default router;
