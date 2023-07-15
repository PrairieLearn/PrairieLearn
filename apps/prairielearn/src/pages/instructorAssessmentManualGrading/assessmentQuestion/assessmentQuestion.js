const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const error = require('@prairielearn/error');
const sqldb = require('@prairielearn/postgres');

const manualGrading = require('../../../lib/manualGrading');

const sql = sqldb.loadSqlEquiv(__filename);

router.get(
  '/',
  asyncHandler(async (req, res, next) => {
    if (!res.locals.authz_data.has_course_instance_permission_view) {
      return next(error.make(403, 'Access denied (must be a student data viewer)'));
    }
    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
  }),
);

router.get(
  '/instances.json',
  asyncHandler(async (req, res, next) => {
    if (!res.locals.authz_data.has_course_instance_permission_view) {
      return next(error.make(403, 'Access denied (must be a student data viewer)'));
    }
    var params = {
      assessment_id: res.locals.assessment.id,
      assessment_question_id: res.locals.assessment_question.id,
    };

    const result = await sqldb.queryAsync(sql.select_instance_questions_manual_grading, params);
    res.send({ instance_questions: result.rows.map((row, idx) => ({ index: idx + 1, ...row })) });
  }),
);

router.get(
  '/next_ungraded',
  asyncHandler(async (req, res, next) => {
    if (!res.locals.authz_data.has_course_instance_permission_view) {
      return next(error.make(403, 'Access denied (must be a student data viewer)'));
    }
    res.redirect(
      await manualGrading.nextUngradedInstanceQuestionUrl(
        res.locals.urlPrefix,
        res.locals.assessment.id,
        res.locals.assessment_question.id,
        res.locals.authz_data.user.user_id,
        req.query.prior_instance_question_id,
      ),
    );
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res, next) => {
    if (!res.locals.authz_data.has_course_instance_permission_edit) {
      return next(error.make(403, 'Access denied (must be a student data editor)'));
    }
    if (req.body.__action === 'batch_action') {
      const action_data = JSON.parse(req.body.batch_action_data) || {};
      const instance_question_ids = Array.isArray(req.body.instance_question_id)
        ? req.body.instance_question_id
        : [req.body.instance_question_id];
      const params = {
        course_instance_id: res.locals.course_instance.id,
        assessment_question_id: res.locals.assessment_question.id,
        instance_question_ids,
        update_requires_manual_grading: 'requires_manual_grading' in action_data,
        requires_manual_grading: !!action_data?.requires_manual_grading,
        update_assigned_grader: 'assigned_grader' in action_data,
        assigned_grader: action_data?.assigned_grader,
      };
      await sqldb.queryAsync(sql.update_instance_questions, params);
      res.send({});
    } else if (req.body.__action === 'edit_question_points') {
      const result = await manualGrading.updateInstanceQuestionScore(
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
      if (result.modified_at_conflict) {
        return res.send({
          conflict_grading_job_id: result.grading_job_id,
          conflict_details_url: `${res.locals.urlPrefix}/assessment/${res.locals.assessment.id}/manual_grading/instance_question/${req.body.instance_question_id}?conflict_grading_job_id=${result.grading_job_id}`,
        });
      }
      res.send({});
    } else if (req.body.__action === 'edit_question_score_perc') {
      const result = await manualGrading.updateInstanceQuestionScore(
        res.locals.assessment.id,
        req.body.instance_question_id,
        null, // submission_id
        req.body.modified_at,
        { score_perc: req.body.score_perc },
        res.locals.authn_user.user_id,
      );
      if (result.modified_at_conflict) {
        return res.send({
          conflict_grading_job_id: result.grading_job_id,
          conflict_details_url: `${res.locals.urlPrefix}/assessment/${res.locals.assessment.id}/manual_grading/instance_question/${req.body.instance_question_id}?conflict_grading_job_id=${result.grading_job_id}`,
        });
      }
      res.send({});
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
