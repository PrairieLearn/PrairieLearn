import asyncHandler from 'express-async-handler';
import z from 'zod';

import * as sqldb from '@prairielearn/postgres';

const sql = sqldb.loadSqlEquiv(import.meta.url);

export default asyncHandler(async (_req, res, next) => {
  res.locals.pendingCourseRequestCount = await sqldb.queryScalar(
    sql.select_pending_course_request_count,
    z.number(),
  );
  next();
});
