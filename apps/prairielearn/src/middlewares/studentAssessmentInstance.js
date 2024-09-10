// @ts-check
import asyncHandler from 'express-async-handler';

import * as sqldb from '@prairielearn/postgres';

var sql = sqldb.loadSqlEquiv(import.meta.url);

export default asyncHandler(async (req, res, next) => {
  const result = await sqldb.queryOneRowAsync(sql.all, {
    assessment_instance_id: res.locals.assessmentInstanceId
      ? res.locals.assessmentInstanceId
      : req.params.assessmentInstanceId,
    user_id: res.locals.user.user_id,
  });
  res.locals.assessmentInstance = result.rows[0];
  res.locals.assessmentId = res.locals.assessmentInstance.assessment_id;
  next();
});
