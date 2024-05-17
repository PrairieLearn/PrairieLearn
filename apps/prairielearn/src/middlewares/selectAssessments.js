// @ts-check
import asyncHandler from 'express-async-handler';

import * as sqldb from '@prairielearn/postgres';

const sql = sqldb.loadSqlEquiv(import.meta.url);

export default asyncHandler(async (req, res, next) => {
  const result = await sqldb.queryAsync(sql.select_assessments, {
    course_instance_id: res.locals.course_instance.id,
    authz_data: res.locals.authz_data,
    req_date: res.locals.req_date,
    assessment_set_id: res.locals.assessment_set.id,
  });
  res.locals.assessments = result.rows;
  next();
});
