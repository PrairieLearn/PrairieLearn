const ERR = require('async-stacktrace');
const path = require('path');
const express = require('express');
const router = express.Router({
  mergeParams: true,
});

const sqldb = require('../../../../prairielib/lib/sql-db');
const sqlLoader = require('../../../../prairielib/lib/sql-loader');

const sql = sqlLoader.load(path.join(__dirname, '..', 'queries.sql'));

router.get('/', (req, res, next) => {
  const params = {
    course_instance_id: res.locals.course_instance.id,
    unsafe_assessment_id: null,
  };
  sqldb.queryOneRow(sql.select_assessments, params, (err, result) => {
    if (ERR(err, next)) return;
    res.status(200).send(result.rows[0].item);
  });
});

router.get('/:unsafe_assessment_id', (req, res, next) => {
  const params = {
    course_instance_id: res.locals.course_instance.id,
    unsafe_assessment_id: req.params.unsafe_assessment_id,
  };
  sqldb.queryOneRow(sql.select_assessments, params, (err, result) => {
    if (ERR(err, next)) return;
    const data = result.rows[0].item;
    if (data.length === 0) {
      res.status(404).send({
        message: 'Not Found',
      });
    } else {
      res.status(200).send(data[0]);
    }
  });
});

router.get('/:unsafe_assessment_id/assessment_instances', (req, res, next) => {
  const params = {
    course_instance_id: res.locals.course_instance.id,
    unsafe_assessment_id: req.params.unsafe_assessment_id,
    unsafe_assessment_instance_id: null,
  };
  sqldb.queryOneRow(sql.select_assessment_instances, params, (err, result) => {
    if (ERR(err, next)) return;
    res.status(200).send(result.rows[0].item);
  });
});

router.get('/:unsafe_assessment_id/assessment_access_rules', (req, res, next) => {
  const params = {
    course_instance_id: res.locals.course_instance.id,
    unsafe_assessment_id: req.params.unsafe_assessment_id,
  };
  sqldb.queryOneRow(sql.select_assessment_access_rules, params, (err, result) => {
    if (ERR(err, next)) return;
    res.status(200).send(result.rows[0].item);
  });
});

module.exports = router;
