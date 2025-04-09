import asyncHandler from 'express-async-handler';

import { loadSqlEquiv, queryZeroOrOneRowAsync } from '@prairielearn/postgres';

import { AccessDenied } from './selectAndAuthzAssessment.html.js';

const sql = loadSqlEquiv(import.meta.url);

export default asyncHandler(async (req, res, next) => {
  const result = await queryZeroOrOneRowAsync(sql.select_and_auth, {
    assessment_id: req.params.assessment_id,
    course_instance_id: res.locals.course_instance.id,
    authz_data: res.locals.authz_data,
    req_date: res.locals.req_date,
  });
  if (result.rowCount === 0) {
    res.status(403).send(AccessDenied({ resLocals: res.locals }));
    return;
  }
  Object.assign(res.locals, result.rows[0]);
  next();
});
