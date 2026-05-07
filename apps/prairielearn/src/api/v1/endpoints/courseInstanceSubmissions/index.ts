import * as path from 'node:path';

import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import * as sqldb from '@prairielearn/postgres';

import { SubmissionDataSchema } from '../courseInstanceAssessmentInstances/index.js';

const sql = sqldb.loadSql(path.join(import.meta.dirname, '..', 'queries.sql'));
const router = Router({ mergeParams: true });

router.get(
  '/:unsafe_submission_id',
  asyncHandler(async (req, res) => {
    const data = await sqldb.queryOptionalRow(
      sql.select_submissions,
      {
        course_instance_id: res.locals.course_instance.id,
        unsafe_assessment_instance_id: null,
        unsafe_submission_id: req.params.unsafe_submission_id,
      },
      SubmissionDataSchema,
    );
    if (data == null) {
      res.status(404).send({ message: 'Not Found' });
    } else {
      res.status(200).send(data);
    }
  }),
);

export default router;
