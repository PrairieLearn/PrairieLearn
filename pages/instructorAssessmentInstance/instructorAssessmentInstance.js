const ERR = require('async-stacktrace');
const _ = require('lodash');
const csvStringify = require('../../lib/nonblocking-csv-stringify');
const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const error = require('../../prairielib/lib/error');
const sqldb = require('@prairielearn/postgres');

const sanitizeName = require('../../lib/sanitize-name');
const ltiOutcomes = require('../../lib/ltiOutcomes');
const assessment = require('../../lib/assessment');

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

router.get(
  '/',
  asyncHandler(async (req, res, _next) => {
    res.locals.logCsvFilename = logCsvFilename(res.locals);
    res.locals.assessment_instance_stats = (
      await sqldb.queryAsync(sql.assessment_instance_stats, {
        assessment_instance_id: res.locals.assessment_instance.id,
      })
    ).rows;

    const dateDurationResult = await sqldb.queryOneRowAsync(sql.select_date_formatted_duration, {
      assessment_instance_id: res.locals.assessment_instance.id,
    });
    res.locals.assessment_instance_date_formatted =
      dateDurationResult.rows[0].assessment_instance_date_formatted;
    res.locals.assessment_instance_duration =
      dateDurationResult.rows[0].assessment_instance_duration;

    res.locals.instance_questions = (
      await sqldb.queryAsync(sql.select_instance_questions, {
        assessment_instance_id: res.locals.assessment_instance.id,
      })
    ).rows;

    res.locals.log = await assessment.selectAssessmentInstanceLog(
      res.locals.assessment_instance.id,
      false
    );

    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
  })
);

router.get(
  '/:filename',
  asyncHandler(async (req, res, next) => {
    if (req.params.filename === logCsvFilename(res.locals)) {
      const log = await assessment.selectAssessmentInstanceLog(
        res.locals.assessment_instance.id,
        false
      );
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
    } else {
      next(error.make(404, 'Unknown filename: ' + req.params.filename));
    }
  })
);

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
    const params = [
      res.locals.assessment.id,
      null, // submission_id
      req.body.instance_question_id,
      null, // uid
      null, // assessment_instance_number
      null, // qid
      req.body.modified_at,
      null, // score_perc
      req.body.points,
      null, // manual_score_perc
      req.body.manual_points,
      null, // auto_score_perc
      req.body.auto_points,
      null, // feedback
      null, // partial_scores
      res.locals.authn_user.user_id,
    ];
    sqldb.call('instance_questions_update_score', params, (err, result) => {
      if (ERR(err, next)) return;
      if (result.rows[0].modified_at_conflict) {
        return res.redirect(
          `${res.locals.urlPrefix}/assessment/${res.locals.assessment.id}/manual_grading/instance_question/${req.body.instance_question_id}?conflict_grading_job_id=${result.rows[0].grading_job_id}`
        );
      }
      ltiOutcomes.updateScore(res.locals.assessment_instance.id, (err) => {
        if (ERR(err, next)) return;
        res.redirect(req.originalUrl);
      });
    });
  } else if (req.body.__action === 'edit_question_score_perc') {
    const params = [
      res.locals.assessment.id,
      null, // submission_id
      req.body.instance_question_id,
      null, // uid
      null, // assessment_instance_number
      null, // qid
      req.body.modified_at,
      req.body.score_perc,
      null, // points
      null, // manual_score_perc
      null, // manual_points
      null, // auto_score_perc
      null, // auto_points
      null, // feedback
      null, // partial_scores
      res.locals.authn_user.user_id,
    ];
    sqldb.call('instance_questions_update_score', params, (err, result) => {
      if (ERR(err, next)) return;
      if (result.rows[0].modified_at_conflict) {
        return res.redirect(
          `${res.locals.urlPrefix}/assessment/${res.locals.assessment.id}/manual_grading/instance_question/${req.body.instance_question_id}?conflict_grading_job_id=${result.rows[0].grading_job_id}`
        );
      }
      ltiOutcomes.updateScore(res.locals.assessment_instance.id, (err) => {
        if (ERR(err, next)) return;
        res.redirect(req.originalUrl);
      });
    });
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
