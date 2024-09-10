// @ts-check
import asyncHandler from 'express-async-handler';
import _ from 'lodash';

import * as error from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';

const sql = sqldb.loadSqlEquiv(import.meta.url);

export async function selectAndAuthzInstructorQuestion(req, res) {
  if (res.locals.course_instance) {
    const result = await sqldb.queryZeroOrOneRowAsync(sql.select_and_auth_with_course_instance, {
      question_id: req.params.question_id,
      course_instance_id: res.locals.course_instance.id,
    });
    if (result.rowCount === 0) throw new error.HttpStatusError(403, 'Access denied');
    _.assign(res.locals, result.rows[0]);
  } else {
    const result = await sqldb.queryZeroOrOneRowAsync(sql.select_and_auth, {
      question_id: req.params.question_id,
      course_id: res.locals.course.id,
    });
    if (result.rowCount === 0) throw new error.HttpStatusError(403, 'Access denied');
    _.assign(res.locals, result.rows[0]);
  }
}

export default asyncHandler(async (req, res, next) => {
  await selectAndAuthzInstructorQuestion(req, res);
  next();
});
