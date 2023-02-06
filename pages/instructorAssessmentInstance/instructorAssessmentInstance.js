const ERR = require('async-stacktrace');
const _ = require('lodash');
const util = require('util');
const csvStringify = require('../../lib/nonblocking-csv-stringify');
const express = require('express');
const router = express.Router();
const error = require('../../prairielib/lib/error');
const sqldb = require('@prairielearn/postgres');

const sanitizeName = require('../../lib/sanitize-name');
const ltiOutcomes = require('../../lib/ltiOutcomes');
const manualGrading = require('../../lib/manualGrading');

const sql = sqldb.loadSqlEquiv(__filename);

const logCsvFilename = (locals) => {
  return (
    sanitizeName.assessmentFilenamePrefix(
      locals.assessment,
      locals.assessment_set,
      locals.course_instance,
      locals.course
    ) +
    sanitizeName.sanitizeString(
      locals.instance_group?.name ?? locals.instance_user?.uid ?? 'unknown'
    ) +
    '_' +
    locals.assessment_instance.number +
    '_' +
    'log.csv'
  );
};

router.get('/', (req, res, next) => {
  res.locals.logCsvFilename = logCsvFilename(res.locals);
  const params = { assessment_instance_id: res.locals.assessment_instance.id };
  sqldb.query(sql.assessment_instance_stats, params, (err, result) => {
    if (ERR(err, next)) return;
    res.locals.assessment_instance_stats = result.rows;

    sqldb.queryOneRow(sql.select_date_formatted_duration, params, (err, result) => {
      if (ERR(err, next)) return;
      res.locals.assessment_instance_date_formatted =
        result.rows[0].assessment_instance_date_formatted;
      res.locals.assessment_instance_duration = result.rows[0].assessment_instance_duration;

      const params = {
        assessment_instance_id: res.locals.assessment_instance.id,
      };
      sqldb.query(sql.select_instance_questions, params, (err, result) => {
        if (ERR(err, next)) return;
        res.locals.instance_questions = result.rows;

        const params = [res.locals.assessment_instance.id, false];
        sqldb.call('assessment_instances_select_log', params, (err, result) => {
          if (ERR(err, next)) return;
          res.locals.log = result.rows;
          res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
        });
      });
    });
  });
});

router.get('/:filename', (req, res, next) => {
  if (req.params.filename === logCsvFilename(res.locals)) {
    const params = [res.locals.assessment_instance.id, false];
    sqldb.call('assessment_instances_select_log', params, (err, result) => {
      if (ERR(err, next)) return;
      const log = result.rows;
      const csvHeaders = [
        'Time',
        'Auth user',
        'Event',
        'Instructor question',
        'Student question',
        'Data',
      ];
      const csvData = _.map(log, (row) => {
        return [
          row.date_iso8601,
          row.auth_user_uid,
          row.event_name,
          row.instructor_question_number == null
            ? null
            : 'I-' + row.instructor_question_number + ' (' + row.qid + ')',
          row.student_question_number == null
            ? null
            : 'S-' +
              row.student_question_number +
              (row.variant_number == null ? '' : '#' + row.variant_number),
          row.data == null ? null : JSON.stringify(row.data),
        ];
      });
      csvData.splice(0, 0, csvHeaders);
      csvStringify(csvData, (err, csv) => {
        if (err) throw Error('Error formatting CSV', err);
        res.attachment(req.params.filename);
        res.send(csv);
      });
    });
  } else {
    next(error.make(404, 'Unknown filename: ' + req.params.filename));
  }
});

router.post('/', (req, res, next) => {
  if (!res.locals.authz_data.has_course_instance_permission_edit) {
    return next(error.make(403, 'Access denied (must be a student data editor)'));
  }

  if (req.body.__action === 'edit_total_points') {
    const params = [
      res.locals.assessment_instance.id,
      req.body.points,
      res.locals.authn_user.user_id,
    ];
    sqldb.call('assessment_instances_update_points', params, (err, _result) => {
      if (ERR(err, next)) return;
      ltiOutcomes.updateScore(res.locals.assessment_instance.id, (err) => {
        if (ERR(err, next)) return;
        res.redirect(req.originalUrl);
      });
    });
  } else if (req.body.__action === 'edit_total_score_perc') {
    const params = [
      res.locals.assessment_instance.id,
      req.body.score_perc,
      res.locals.authn_user.user_id,
    ];
    sqldb.call('assessment_instances_update_score_perc', params, (err, _result) => {
      if (ERR(err, next)) return;
      ltiOutcomes.updateScore(res.locals.assessment_instance.id, (err) => {
        if (ERR(err, next)) return;
        res.redirect(req.originalUrl);
      });
    });
  } else if (req.body.__action === 'edit_question_points') {
    util.callbackify(manualGrading.updateInstanceQuestionScore)(
      res.locals.assessment.id,
      req.body.instance_question_id,
      null, // submission_id
      req.body.modified_at,
      {
        points: req.body.points,
        manual_points: req.body.manual_points,
        auto_points: req.body.auto_points,
      },
      res.locals.authn_user.user_id,
      (err, result) => {
        if (ERR(err, next)) return;
        if (result.modified_at_conflict) {
          return res.redirect(
            `${res.locals.urlPrefix}/assessment/${res.locals.assessment.id}/manual_grading/instance_question/${req.body.instance_question_id}?conflict_grading_job_id=${result.grading_job_id}`
          );
        }
        res.redirect(req.originalUrl);
      }
    );
  } else if (req.body.__action === 'edit_question_score_perc') {
    util.callbackify(manualGrading.updateInstanceQuestionScore)(
      res.locals.assessment.id,
      req.body.instance_question_id,
      null, // submission_id
      req.body.modified_at,
      { score_perc: req.body.score_perc },
      res.locals.authn_user.user_id,
      (err, result) => {
        if (ERR(err, next)) return;
        if (result.modified_at_conflict) {
          return res.redirect(
            `${res.locals.urlPrefix}/assessment/${res.locals.assessment.id}/manual_grading/instance_question/${req.body.instance_question_id}?conflict_grading_job_id=${result.grading_job_id}`
          );
        }
        res.redirect(req.originalUrl);
      }
    );
  } else {
    return next(
      error.make(400, 'unknown __action', {
        locals: res.locals,
        body: req.body,
      })
    );
  }
});

module.exports = router;
