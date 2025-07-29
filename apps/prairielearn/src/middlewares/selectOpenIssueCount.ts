import asyncHandler from 'express-async-handler';
import z from 'zod';

import * as sqldb from '@prairielearn/postgres';

const sql = sqldb.loadSqlEquiv(import.meta.url);

export interface ResLocalsCourseIssueCount {
  navbarOpenIssueCount: number;
}

export default asyncHandler(async (req, res, next) => {
  const count = await sqldb.queryRow(
    sql.select_open_issue_count,
    {
      course_id: res.locals.course.id,
    },
    z.number(),
  );
  res.locals.navbarOpenIssueCount = count;
  next();
});
