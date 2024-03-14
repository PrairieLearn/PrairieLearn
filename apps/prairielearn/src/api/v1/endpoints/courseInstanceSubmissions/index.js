const asyncHandler = require('express-async-handler');
const path = require('path');
const express = require('express');
const router = express.Router({ mergeParams: true });

const sqldb = require('@prairielearn/postgres');

const sql = sqldb.loadSql(path.join(__dirname, '..', 'queries.sql'));

router.get(
  '/:unsafe_submission_id',
  asyncHandler(async (req, res) => {
    const result = await sqldb.queryOneRowAsync(sql.select_submissions, {
      course_instance_id: res.locals.course_instance.id,
      unsafe_assessment_instance_id: null,
      unsafe_submission_id: req.params.unsafe_submission_id,
    });
    const data = result.rows[0].item;
    if (data.length === 0) {
      res.status(404).send({
        message: 'Not Found',
      });
    } else {
      res.status(200).send(data[0]);
    }
  }),
);

module.exports = router;
