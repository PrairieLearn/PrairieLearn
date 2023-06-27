const express = require('express');
const asyncHandler = require('express-async-handler');
const router = express.Router();
const {loadSqlEquiv} = require('@prairielearn/postgres');
const sqldb = require('@prairielearn/postgres');
const sql = loadSqlEquiv(__filename);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const params = {
      assessment_id: res.locals.assessment.id,
      current_user_id: res.locals.user.user_id,
    };

    const result = await sqldb.queryAsync(sql.selectQuery, params);

    res.render(__filename.replace(/\.js$/, '.ejs'), {
      policies: result.rows,
      assessment_id: params.assessment_id,
      current_user_id: params.current_user_id,
    });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const params = {
      assessment_id: req.body.assessment_id,
      created_at: new Date(req.body.created_at),
      created_by: req.body.current_user_id,
      credit: req.body.credit,
      end_date: new Date(req.body.end_date),
      group_id: req.body.group_id || null,
      note: req.body.note || null,
      start_date: new Date(req.body.start_date),
      type: req.body.type,
      user_id: req.body.user_id,
    };

    const insertQuery = sql.insertQuery;

    await sqldb.queryAsync(insertQuery, params);


    res.redirect(req.originalUrl);
  })
);

module.exports = router;
