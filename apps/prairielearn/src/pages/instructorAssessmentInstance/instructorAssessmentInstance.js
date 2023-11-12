const express = require('express');
const { pipeline } = require('node:stream/promises');
const asyncHandler = require('express-async-handler');
const error = require('@prairielearn/error');
const sqldb = require('@prairielearn/postgres');
const { stringifyStream } = require('@prairielearn/csv');

const sanitizeName = require('../../lib/sanitize-name');
const ltiOutcomes = require('../../lib/ltiOutcomes');
const manualGrading = require('../../lib/manualGrading');
const assessment = require('../../lib/assessment');

const router = express.Router();
const sql = sqldb.loadSqlEquiv(__filename);

const logCsvFilename = (locals) => {
  return (
    sanitizeName.assessmentFilenamePrefix(
      locals.assessment,
      locals.assessment_set,
      locals.course_instance,
      locals.course,
    ) +
    sanitizeName.sanitizeString(
      locals.instance_group?.name ?? locals.instance_user?.uid ?? 'unknown',
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
    if (!res.locals.authz_data.has_course_instance_permission_view) {
      throw error.make(403, 'Access denied (must be a student data viewer)');
    }
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
      false,
    );

    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
  }),
);

router.get(
  '/:filename',
  asyncHandler(async (req, res, next) => {
    if (!res.locals.authz_data.has_course_instance_permission_view) {
      throw error.make(403, 'Access denied (must be a student data viewer)');
    }
    if (req.params.filename === logCsvFilename(res.locals)) {
      const cursor = await assessment.selectAssessmentInstanceLogCursor(
        res.locals.assessment_instance.id,
        false,
      );

      const stringifier = stringifyStream({
        header: true,
        columns: ['Time', 'Auth user', 'Event', 'Instructor question', 'Student question', 'Data'],
        transform(record) {
          return [
            record.date_iso8601,
            record.auth_user_uid,
            record.event_name,
            record.instructor_question_number == null
              ? null
              : 'I-' + record.instructor_question_number + ' (' + record.qid + ')',
            record.student_question_number == null
              ? null
              : 'S-' +
                record.student_question_number +
                (record.variant_number == null ? '' : '#' + record.variant_number),
            record.data == null ? null : JSON.stringify(record.data),
          ];
        },
      });

      res.attachment(req.params.filename);
      await pipeline(cursor.stream(100), stringifier, res);
    } else {
      next(error.make(404, 'Unknown filename: ' + req.params.filename));
    }
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res, next) => {
    if (!res.locals.authz_data.has_course_instance_permission_edit) {
      throw error.make(403, 'Access denied (must be a student data editor)');
    }

    if (req.body.__action === 'edit_total_points') {
      await sqldb.callAsync('assessment_instances_update_points', [
        res.locals.assessment_instance.id,
        req.body.points,
        res.locals.authn_user.user_id,
      ]);
      await ltiOutcomes.updateScoreAsync(res.locals.assessment_instance.id);
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'edit_total_score_perc') {
      await sqldb.callAsync('assessment_instances_update_score_perc', [
        res.locals.assessment_instance.id,
        req.body.score_perc,
        res.locals.authn_user.user_id,
      ]);
      await ltiOutcomes.updateScoreAsync(res.locals.assessment_instance.id);
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'edit_question_points') {
      const { modified_at_conflict, grading_job_id } =
        await manualGrading.updateInstanceQuestionScore(
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
        );
      if (modified_at_conflict) {
        return res.redirect(
          `${res.locals.urlPrefix}/assessment/${res.locals.assessment.id}/manual_grading/instance_question/${req.body.instance_question_id}?conflict_grading_job_id=${grading_job_id}`,
        );
      }
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'edit_question_score_perc') {
      const { modified_at_conflict, grading_job_id } =
        await manualGrading.updateInstanceQuestionScore(
          res.locals.assessment.id,
          req.body.instance_question_id,
          null, // submission_id
          req.body.modified_at,
          { score_perc: req.body.score_perc },
          res.locals.authn_user.user_id,
        );
      if (modified_at_conflict) {
        return res.redirect(
          `${res.locals.urlPrefix}/assessment/${res.locals.assessment.id}/manual_grading/instance_question/${req.body.instance_question_id}?conflict_grading_job_id=${grading_job_id}`,
        );
      }
      res.redirect(req.originalUrl);
    } else {
      return next(
        error.make(400, 'unknown __action', {
          locals: res.locals,
          body: req.body,
        }),
      );
    }
  }),
);

module.exports = router;
