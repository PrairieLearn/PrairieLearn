import asyncHandler from 'express-async-handler';

import * as sqldb from '@prairielearn/postgres';
import z from 'zod';

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
