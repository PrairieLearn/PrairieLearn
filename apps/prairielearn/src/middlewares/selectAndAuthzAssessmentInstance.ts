import { type Request, type Response } from 'express';
import asyncHandler from 'express-async-handler';

import * as error from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';

const sql = sqldb.loadSqlEquiv(import.meta.url);

export async function selectAndAuthzAssessmentInstance(req: Request, res: Response) {
  const result = await sqldb.queryAsync(sql.select_and_auth, {
    assessment_instance_id: req.params.assessment_instance_id,
    course_instance_id: res.locals.course_instance.id,
    authz_data: res.locals.authz_data,
    req_date: res.locals.req_date,
  });
  if (result.rowCount === 0) throw new error.HttpStatusError(403, 'Access denied');
  Object.assign(res.locals, result.rows[0]);
}

export default asyncHandler(async (req, res, next) => {
  await selectAndAuthzAssessmentInstance(req, res);
  next();
});
