import asyncHandler from 'express-async-handler';
import z from 'zod';

import * as sqldb from '@prairielearn/postgres';

const sql = sqldb.loadSqlEquiv(import.meta.url);

export default asyncHandler(async (req, res, next) => {
  const result = await sqldb.queryValidatedOneRow(
    sql.select_open_issue_count,
    {
      course_id: res.locals.course.id,
    },
    z.object({
      count: z.number(),
    }),
  );
  res.locals.navbarOpenIssueCount = result.count;
  next();
});
