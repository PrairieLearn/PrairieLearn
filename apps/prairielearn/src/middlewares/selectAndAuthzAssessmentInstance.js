// @ts-check
import * as _ from 'lodash';
const asyncHandler = require('express-async-handler');

import * as sqldb from '@prairielearn/postgres';
import * as error from '@prairielearn/error';

var sql = sqldb.loadSqlEquiv(__filename);

export async function selectAndAuthzAssessmentInstance(req, res) {
  const result = await sqldb.queryAsync(sql.select_and_auth, {
    assessment_instance_id: req.params.assessment_instance_id,
    course_instance_id: res.locals.course_instance.id,
    authz_data: res.locals.authz_data,
    req_date: res.locals.req_date,
  });
  if (result.rowCount === 0) throw error.make(403, 'Access denied');
  _.assign(res.locals, result.rows[0]);
}

export default asyncHandler(async (req, res, next) => {
  await selectAndAuthzAssessmentInstance(req, res);
  next();
});
