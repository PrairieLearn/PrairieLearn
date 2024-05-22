// @ts-check
import asyncHandler from 'express-async-handler';
import _ from 'lodash';

import * as error from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';

const sql = sqldb.loadSqlEquiv(import.meta.url);

export default asyncHandler(async (req, res, next) => {
  const result = await sqldb.queryZeroOrOneRowAsync(sql.select_and_auth, {
    assessment_id: req.params.assessment_id,
    course_instance_id: res.locals.course_instance.id,
    authz_data: res.locals.authz_data,
    req_date: res.locals.req_date,
  });
  if (result.rowCount === 0) throw new error.HttpStatusError(403, 'Access denied');
  _.assign(res.locals, result.rows[0]);
  next();
});
