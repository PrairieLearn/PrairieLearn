const ERR = require('async-stacktrace');
const path = require('path');
const express = require('express');
const router = express.Router({
  mergeParams: true,
});

const sqldb = require('../../../../prairielib/lib/sql-db');
const sqlLoader = require('../../../../prairielib/lib/sql-loader');

const sql = sqlLoader.load(path.join(__dirname, '..', 'queries.sql'));

router.get('/:unsafe_assessment_instance_id', (req, res, next) => {
  const params = {
    course_instance_id: res.locals.course_instance.id,
    unsafe_assessment_id: null,
    unsafe_assessment_instance_id: req.params.unsafe_assessment_instance_id,
  };
  sqldb.queryOneRow(sql.select_assessment_instances, params, (err, result) => {
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

router.get('/:unsafe_assessment_instance_id/instance_questions', (req, res, next) => {
  const params = {
    course_instance_id: res.locals.course_instance.id,
    unsafe_assessment_instance_id: req.params.unsafe_assessment_instance_id,
  };
  sqldb.queryOneRow(sql.select_instance_questions, params, (err, result) => {
    if (ERR(err, next)) return;
    res.status(200).send(result.rows[0].item);
  });
});

router.get('/:unsafe_assessment_instance_id/submissions', (req, res, next) => {
  const params = {
    course_instance_id: res.locals.course_instance.id,
    unsafe_assessment_instance_id: req.params.unsafe_assessment_instance_id,
    unsafe_submission_id: null,
  };
  sqldb.queryOneRow(sql.select_submissions, params, (err, result) => {
    if (ERR(err, next)) return;
    res.status(200).send(result.rows[0].item);
  });
});

router.get('/:unsafe_assessment_instance_id/log', (req, res, next) => {
  sqldb.queryZeroOrOneRow(
    sql.select_assessment_instance,
    {
      course_instance_id: res.locals.course_instance.id,
      unsafe_assessment_instance_id: req.params.unsafe_assessment_instance_id,
    },
    (err, result) => {
      if (ERR(err, next)) return;
      if (result.rowCount === 0) {
        res.status(404).send({
          message: 'Not Found',
        });
        return;
      }

      const params = [result.rows[0].assessment_instance_id, true];
      sqldb.call('assessment_instances_select_log', params, (err, result) => {
        if (ERR(err, next)) return;
        res.status(200).send(result.rows);
      });
    }
  );
});

module.exports = router;
