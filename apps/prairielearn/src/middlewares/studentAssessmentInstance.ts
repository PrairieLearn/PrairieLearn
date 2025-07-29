import asyncHandler from 'express-async-handler';

import * as sqldb from '@prairielearn/postgres';

import { AssessmentInstanceSchema } from '../lib/db-types.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

export default asyncHandler(async (req, res, next) => {
  const result = await sqldb.queryRow(
    sql.assessment_instance_by_id,
    {
      assessment_instance_id: res.locals.assessmentInstanceId
        ? res.locals.assessmentInstanceId
        : req.params.assessmentInstanceId,
      user_id: res.locals.user.user_id,
    },
    AssessmentInstanceSchema,
  );
  res.locals.assessmentInstance = result;
  res.locals.assessmentId = res.locals.assessmentInstance.assessment_id;
  next();
});
