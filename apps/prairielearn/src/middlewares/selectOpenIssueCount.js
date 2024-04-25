// @ts-check
const asyncHandler = require('express-async-handler');
import * as sqldb from '@prairielearn/postgres';

var sql = sqldb.loadSqlEquiv(__filename);

export default asyncHandler(async (req, res, next) => {
  const result = await sqldb.queryOneRowAsync(sql.select_open_issue_count, {
    course_id: res.locals.course.id,
  });
  res.locals.navbarOpenIssueCount = result.rows[0].count;
  next();
});
