// @ts-check
const asyncHandler = require('express-async-handler');
const path = require('path');
const express = require('express');
const router = express.Router({ mergeParams: true });

const sqldb = require('@prairielearn/postgres');

const sql = sqldb.loadSql(path.join(__dirname, '..', 'queries.sql'));

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const result = await sqldb.queryOneRowAsync(sql.select_assessments, {
      course_instance_id: res.locals.course_instance.id,
      unsafe_assessment_id: null,
    });
    res.status(200).send(result.rows[0].item);
  }),
);

router.get(
  '/:unsafe_assessment_id',
  asyncHandler(async (req, res) => {
    const result = await sqldb.queryOneRowAsync(sql.select_assessments, {
      course_instance_id: res.locals.course_instance.id,
      unsafe_assessment_id: req.params.unsafe_assessment_id,
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
  '/:unsafe_assessment_id/assessment_instances',
  asyncHandler(async (req, res) => {
    const result = await sqldb.queryOneRowAsync(sql.select_assessment_instances, {
      course_instance_id: res.locals.course_instance.id,
      unsafe_assessment_id: req.params.unsafe_assessment_id,
      unsafe_assessment_instance_id: null,
    });
    res.status(200).send(result.rows[0].item);
  }),
);

router.get(
  '/:unsafe_assessment_id/assessment_access_rules',
  asyncHandler(async (req, res) => {
    const result = await sqldb.queryOneRowAsync(sql.select_assessment_access_rules, {
      course_instance_id: res.locals.course_instance.id,
      unsafe_assessment_id: req.params.unsafe_assessment_id,
    });
    res.status(200).send(result.rows[0].item);
  }),
);

module.exports = router;
