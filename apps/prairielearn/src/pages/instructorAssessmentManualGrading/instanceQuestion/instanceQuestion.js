const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const util = require('util');
const qs = require('qs');
const ejs = require('ejs');
const path = require('path');

const question = require('../../../lib/question');
const manualGrading = require('../../../lib/manualGrading');
const { features } = require('../../../lib/features/index');

const error = require('@prairielearn/error');
const sqldb = require('@prairielearn/postgres');

const sql = sqldb.loadSqlEquiv(__filename);

async function prepareLocalsForRender(req, res) {
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
      res.locals,
    );
  }

  res.locals.rubric_settings_visible = await features.enabledFromLocals(
    'manual-grading-rubrics',
    res.locals,
  );

  // If student never loaded question or never submitted anything (submission is null)
  if (!res.locals.submission) {
    throw error.make(404, 'Instance question does not have a gradable submission.');
  }

  res.locals.conflict_grading_job = null;
  if (req.query.conflict_grading_job_id) {
    const params = {
      grading_job_id: req.query.conflict_grading_job_id,
      instance_question_id: res.locals.instance_question.id, // for authz
    };
    res.locals.conflict_grading_job = (
      await sqldb.queryZeroOrOneRowAsync(sql.select_grading_job_data, params)
    ).rows[0];
    await manualGrading.populateManualGradingData(res.locals.conflict_grading_job);
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
  }),
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
      false, // renderScorePanels
    );
    res.send({ submissionPanel: results.submissionPanel });
  }),
);

router.get(
  '/grading_rubric_panels',
  asyncHandler(async (req, res, _next) => {
    try {
      await prepareLocalsForRender(req, res);
      // Using util.promisify on renderFile instead of {async: true} from EJS, because the
      // latter would require all includes in EJS to be translated to await recursively.
      const gradingPanel = await util.promisify(ejs.renderFile)(
        path.join(__dirname, 'gradingPanel.ejs'),
        { context: 'main', ...res.locals },
      );
      const rubricSettings = await util.promisify(ejs.renderFile)(
        path.join(__dirname, 'rubricSettingsModal.ejs'),
        res.locals,
      );
      res.send({ gradingPanel, rubricSettings });
    } catch (err) {
      res.send({ err: String(err) });
    }
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res, next) => {
    if (!res.locals.authz_data.has_course_instance_permission_edit) {
      return next(error.make(403, 'Access denied (must be a student data editor)'));
    }
    if (req.body.__action === 'add_manual_grade') {
      let manual_rubric_data = null;
      if (res.locals.assessment_question.manual_rubric_id) {
        let manual_rubric_items = req.body.rubric_item_selected_manual || [];
        if (!Array.isArray(manual_rubric_items)) {
          manual_rubric_items = [manual_rubric_items];
        }
        manual_rubric_data = {
          rubric_id: res.locals.assessment_question.manual_rubric_id,
          applied_rubric_items: manual_rubric_items.map((id) => ({ rubric_item_id: id })),
          adjust_points: req.body.score_manual_adjust_points || null,
        };
      }

      const update_result = await manualGrading.updateInstanceQuestionScore(
        res.locals.assessment.id,
        res.locals.instance_question.id,
        req.body.submission_id,
        req.body.modified_at,
        {
          manual_score_perc: req.body.use_score_perc ? req.body.score_manual_percent : null,
          manual_points: req.body.use_score_perc ? null : req.body.score_manual_points,
          auto_score_perc: req.body.use_score_perc ? req.body.score_auto_percent || null : null,
          auto_points: req.body.use_score_perc ? null : req.body.score_auto_points || null,
          feedback: { manual: req.body.submission_note },
          manual_rubric_data,
        },
        res.locals.authn_user.user_id,
      );

      if (update_result.modified_at_conflict) {
        return res.redirect(
          req.baseUrl + `?conflict_grading_job_id=${update_result.grading_job_id}`,
        );
      }
      res.redirect(
        await manualGrading.nextUngradedInstanceQuestionUrl(
          res.locals.urlPrefix,
          res.locals.assessment.id,
          res.locals.assessment_question.id,
          res.locals.authz_data.user.user_id,
          res.locals.instance_question.id,
        ),
      );
    } else if (req.body.__action === 'modify_rubric_settings') {
      // Parse using qs, which allows deep objects to be created based on parameter names
      // e.g., the key `rubric_item[cur1][points]` converts to `rubric_item: { cur1: { points: ... } ... }`
      const rubric_items = Object.values(qs.parse(qs.stringify(req.body)).rubric_item || {}).map(
        (item) => ({ ...item, always_show_to_students: item.always_show_to_students === 'true' }),
      );
      manualGrading
        .updateAssessmentQuestionRubric(
          res.locals.instance_question.assessment_question_id,
          req.body.use_rubric === 'true',
          req.body.replace_auto_points === 'true',
          req.body.starting_points,
          req.body.min_points,
          req.body.max_extra_points,
          rubric_items,
          !!req.body.tag_for_manual_grading,
          res.locals.authn_user.user_id,
        )
        .then(() => {
          res.redirect(req.baseUrl + '/grading_rubric_panels');
        })
        .catch((err) => {
          res.status(500).send({ err: String(err) });
        });
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
          res.locals.assessment_question.id,
          res.locals.authz_data.user.user_id,
          res.locals.instance_question.id,
        ),
      );
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
