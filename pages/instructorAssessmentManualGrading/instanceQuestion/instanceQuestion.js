const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const util = require('util');
const qs = require('qs');
const ejs = require('ejs');
const path = require('path');

const question = require('../../../lib/question');
const error = require('../../../prairielib/lib/error');
const sqldb = require('../../../prairielib/lib/sql-db');
const sqlLoader = require('../../../prairielib/lib/sql-loader');
const ltiOutcomes = require('../../../lib/ltiOutcomes');
const manualGrading = require('../../../lib/manualGrading');

const sql = sqlLoader.loadSqlEquiv(__filename);

async function prepareLocalsForRender(req, res) {
  res.locals.conflict_grading_job = null;
  if (req.query.conflict_grading_job_id) {
    const params = {
      grading_job_id: req.query.conflict_grading_job_id,
      instance_question_id: res.locals.instance_question.id, // for authz
    };
    res.locals.conflict_grading_job = (
      await sqldb.queryZeroOrOneRowAsync(sql.select_grading_job_data, params)
    ).rows[0];
  }

  // Even though getAndRenderVariant will select variants for the instance question, if the
  // question has multiple variants, by default getAndRenderVariant may select a variant without
  // submissions or even create a new one. We don't want that behaviour, so we select the last
  // submission and pass it along to getAndRenderVariant explicitly.
  const params = { instance_question_id: res.locals.instance_question.id };
  const variant_with_submission = (
    await sqldb.queryZeroOrOneRowAsync(sql.select_variant_with_last_submission, params)
  ).rows[0];

  if (variant_with_submission) {
    res.locals.manualGradingInterface = true;
    await util.promisify(question.getAndRenderVariant)(
      variant_with_submission.variant_id,
      null,
      res.locals
    );
  }

  // If student never loaded question or never submitted anything (submission is null)
  if (!res.locals.submission) {
    throw error.make(404, 'Instance question does not have a gradable submission.');
  }

  const graders_result = await sqldb.queryZeroOrOneRowAsync(sql.select_graders, {
    course_instance_id: res.locals.course_instance.id,
  });
  res.locals.graders = graders_result.rows[0]?.graders;
}

router.get(
  '/',
  asyncHandler(async (req, res, next) => {
    if (!res.locals.authz_data.has_course_instance_permission_view) {
      return next(error.make(403, 'Access denied (must be a student data viewer)'));
    }

    await prepareLocalsForRender(req, res);
    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
  })
);

router.get(
  '/variant/:variant_id/submission/:submission_id',
  asyncHandler(async (req, res, _next) => {
    const results = await util.promisify(question.renderPanelsForSubmission)(
      req.params.submission_id,
      res.locals.question.id,
      res.locals.instance_question.id,
      req.params.variant_id,
      res.locals.urlPrefix,
      null, // questionContext
      null, // csrfToken
      null, // authorizedEdit
      false // renderScorePanels
    );
    res.send({ submissionPanel: results.submissionPanel });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res, next) => {
    if (!res.locals.authz_data.has_course_instance_permission_edit) {
      return next(error.make(403, 'Access denied (must be a student data editor)'));
    }
    if (req.body.__action === 'add_manual_grade') {
      let manual_rubric_items = req.body.rubric_item_selected_manual || [];
      let auto_rubric_items = req.body.rubric_item_selected_auto || [];
      if (!Array.isArray(manual_rubric_items)) {
        manual_rubric_items = [manual_rubric_items];
      }
      if (!Array.isArray(auto_rubric_items)) {
        auto_rubric_items = [auto_rubric_items];
      }
      const params = [
        req.body.assessment_id,
        null, // assessment_instance_id,
        null, // submission_id
        res.locals.instance_question.id, // instance_question_id,
        null, // uid
        null, // assessment_instance_number
        null, // qid
        req.body.modified_at,
        null, // score_perc
        null, // points
        req.body.use_score_perc ? req.body.score_manual_percent : null, // manual_score_perc
        req.body.use_score_perc ? null : req.body.score_manual_points, // manual_points
        req.body.use_score_perc ? req.body.score_auto_percent || null : null, // auto_score_perc
        req.body.use_score_perc ? null : req.body.score_auto_points || null, // auto_points
        { manual: req.body.submission_note }, // feedback
        null, // partial_scores
        manual_rubric_items,
        auto_rubric_items,
        res.locals.authn_user.user_id,
      ];

      /*
       * TODO: calling 'instance_questions_update_score' may not be the perfect thing to do here,
       * because it won't respect the 'credit' property of the assessment_instance.  However, allowing
       * the 'credit' calculation in a manually graded problem is also problematic, because it means
       * that the behavior of the instructor editing the score on the manual grading page would be
       * different than the behavior of the instructor editing the score on any of the other pages
       * where they can edit score. Fundamentally, we need to rethink how to treat questions that are
       * manually graded within PrairieLearn and how to handle those score calculations.
       */
      const update_result = (await sqldb.callAsync('instance_questions_update_score', params))
        .rows[0];
      if (update_result.modified_at_conflict) {
        return res.redirect(
          req.baseUrl + `?conflict_grading_job_id=${update_result.grading_job_id}`
        );
      }
      await util.promisify(ltiOutcomes.updateScore)(req.body.assessment_instance_id);
      res.redirect(
        await manualGrading.nextUngradedInstanceQuestionUrl(
          res.locals.urlPrefix,
          res.locals.assessment.id,
          req.body.assessment_question_id,
          res.locals.authz_data.user.user_id,
          res.locals.instance_question.id
        )
      );
    } else if (req.body.__action === 'modify_rubric_settings') {
      const rubric_items = Object.values(qs.parse(qs.stringify(req.body)).rubric_item || {});
      const params = [
        res.locals.instance_question.assessment_question_id,
        req.body.rubric_type,
        !!req.body.use_rubrics,
        req.body.starting_points === 'CUSTOM'
          ? req.body.starting_points_custom
          : req.body.starting_points,
        req.body.min_points,
        req.body.max_points,
        JSON.stringify(rubric_items),
      ];
      const result = await sqldb.callAsync('assessment_questions_update_rubric', params);
      res.locals.assessment_question[`${req.body.rubric_type}_rubric_id`] =
        result.rows[0].arg_rubric_id;

      // This form is handled by Ajax, so send a new version of the grading panel via JSON.
      await prepareLocalsForRender(req, res);
      // Using util.promisify on renderFile instead of {async: true} from EJS, because the
      // latter would require all includes in EJS to be translated to await recursively.
      const gradingPanel = await util.promisify(ejs.renderFile)(
        path.join(__dirname, 'gradingPanel.ejs'),
        res.locals
      );
      const rubricSettingsManual = await util.promisify(ejs.renderFile)(
        path.join(__dirname, 'rubricSettingsModal.ejs'),
        {
          type: 'manual',
          rubric: res.locals.rubric_data_manual,
          max_points: res.locals.assessment_question.max_manual_points,
          ...res.locals,
        }
      );
      const rubricSettingsAuto = await util.promisify(ejs.renderFile)(
        path.join(__dirname, 'rubricSettingsModal.ejs'),
        {
          type: 'auto',
          rubric: res.locals.rubric_data_auto,
          max_points: res.locals.assessment_question.max_auto_points,
          ...res.locals,
        }
      );
      res.send({ gradingPanel, rubricSettingsManual, rubricSettingsAuto });
    } else if (typeof req.body.__action === 'string' && req.body.__action.startsWith('reassign_')) {
      const assigned_grader = req.body.__action.substring(9);
      const params = {
        course_instance_id: res.locals.course_instance.id,
        assessment_id: res.locals.assessment.id,
        instance_question_id: res.locals.instance_question.id,
        assigned_grader: ['nobody', 'graded'].includes(assigned_grader) ? null : assigned_grader,
        requires_manual_grading: assigned_grader !== 'graded',
      };
      await sqldb.queryAsync(sql.update_assigned_grader, params);

      res.redirect(
        await manualGrading.nextUngradedInstanceQuestionUrl(
          res.locals.urlPrefix,
          res.locals.assessment.id,
          req.body.assessment_question_id,
          res.locals.authz_data.user.user_id,
          res.locals.instance_question.id
        )
      );
    } else {
      return next(
        error.make(400, 'unknown __action', {
          locals: res.locals,
          body: req.body,
        })
      );
    }
  })
);
module.exports = router;
