// @ts-check
const asyncHandler = require('express-async-handler');
const express = require('express');
const router = express.Router({ mergeParams: true });

const sqldb = require('@prairielearn/postgres');

const sql = sqldb.loadSqlEquiv(__filename);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const result = await sqldb.queryOneRowAsync(sql.select_user_scores, {
      course_instance_id: res.locals.course_instance.id,
    });
    res.status(200).send(result.rows[0].item);
  }),
);

module.exports = router;
