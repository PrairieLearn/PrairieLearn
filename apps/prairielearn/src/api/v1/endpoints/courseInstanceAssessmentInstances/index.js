// @ts-check
const asyncHandler = require('express-async-handler');
const path = require('path');
const express = require('express');
const assessment = require('../../../../lib/assessment');
const router = express.Router({ mergeParams: true });

const sqldb = require('@prairielearn/postgres');

const sql = sqldb.loadSql(path.join(__dirname, '..', 'queries.sql'));

router.get(
  '/:unsafe_assessment_instance_id',
  asyncHandler(async (req, res) => {
    const result = await sqldb.queryOneRowAsync(sql.select_assessment_instances, {
      course_instance_id: res.locals.course_instance.id,
      unsafe_assessment_id: null,
      unsafe_assessment_instance_id: req.params.unsafe_assessment_instance_id,
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

router.get(
  '/:unsafe_assessment_instance_id/instance_questions',
  asyncHandler(async (req, res) => {
    const result = await sqldb.queryOneRowAsync(sql.select_instance_questions, {
      course_instance_id: res.locals.course_instance.id,
      unsafe_assessment_instance_id: req.params.unsafe_assessment_instance_id,
    });
    res.status(200).send(result.rows[0].item);
  }),
);

router.get(
  '/:unsafe_assessment_instance_id/submissions',
  asyncHandler(async (req, res) => {
    const result = await sqldb.queryOneRowAsync(sql.select_submissions, {
      course_instance_id: res.locals.course_instance.id,
      unsafe_assessment_instance_id: req.params.unsafe_assessment_instance_id,
      unsafe_submission_id: null,
    });
    res.status(200).send(result.rows[0].item);
  }),
);

router.get(
  '/:unsafe_assessment_instance_id/log',
  asyncHandler(async (req, res) => {
    const result = await sqldb.queryZeroOrOneRowAsync(sql.select_assessment_instance, {
      course_instance_id: res.locals.course_instance.id,
      unsafe_assessment_instance_id: req.params.unsafe_assessment_instance_id,
    });
    if (result.rowCount === 0) {
      res.status(404).send({
        message: 'Not Found',
      });
      return;
    }

    const logs = await assessment.selectAssessmentInstanceLog(
      result.rows[0].assessment_instance_id,
      true,
    );
    res.status(200).send(logs);
  }),
);

module.exports = router;
