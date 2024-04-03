// @ts-check
import * as _ from 'lodash';
const asyncHandler = require('express-async-handler');

import * as sqldb from '@prairielearn/postgres';
import * as error from '@prairielearn/error';

const sql = sqldb.loadSqlEquiv(__filename);

export async function selectAndAuthzInstructorQuestion(req, res) {
  if (res.locals.course_instance) {
    const result = await sqldb.queryZeroOrOneRowAsync(sql.select_and_auth_with_course_instance, {
      question_id: req.params.question_id,
      course_instance_id: res.locals.course_instance.id,
    });
    if (result.rowCount === 0) throw error.make(403, 'Access denied');
    _.assign(res.locals, result.rows[0]);
  } else {
    const result = await sqldb.queryZeroOrOneRowAsync(sql.select_and_auth, {
      question_id: req.params.question_id,
      course_id: res.locals.course.id,
    });
    if (result.rowCount === 0) throw error.make(403, 'Access denied');
    _.assign(res.locals, result.rows[0]);
  }
}

export default asyncHandler(async (req, res, next) => {
  await selectAndAuthzInstructorQuestion(req, res);
  next();
});
