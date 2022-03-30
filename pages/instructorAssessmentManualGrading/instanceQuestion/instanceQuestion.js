const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const util = require('util');
const question = require('../../../lib/question');
const error = require('../../../prairielib/lib/error');
const sqlDb = require('../../../prairielib/lib/sql-db');
const sqlLoader = require('../../../prairielib/lib/sql-loader');
const ltiOutcomes = require('../../../lib/ltiOutcomes');
const manualGrading = require('../../../lib/manualGrading');

const sql = sqlLoader.loadSqlEquiv(__filename);

router.get(
  '/',
  asyncHandler(async (req, res, next) => {
    if (!res.locals.authz_data.has_course_instance_permission_view) {
      return next(error.make(403, 'Access denied (must be a student data viewer)'));
    }

    res.locals.conflict_grading_job = null;
    if (req.query.conflict_grading_job_id) {
      const params = {
        grading_job_id: req.query.conflict_grading_job_id,
        instance_question_id: res.locals.instance_question.id, // for authz
      };
      res.locals.conflict_grading_job = (
        await sqlDb.queryZeroOrOneRowAsync(sql.select_grading_job_data, params)
      ).rows[0];
    }

    res.locals.manualGradingInterface = true;
    await util.promisify(question.getAndRenderVariant)(null, null, res.locals);

    // If student never loaded question or never submitted anything (submission is null)
    if (!res.locals.submission) {
      return next(error.make(404, 'Instance question does not have a gradable submission.'));
    }

    const graders_result = await sqlDb.queryZeroOrOneRowAsync(sql.select_graders, {
      course_instance_id: res.locals.course_instance.id,
    });
    res.locals.graders = graders_result.rows[0]?.graders;

    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
  })
);

router.post(
  '/',
  asyncHandler(async (req, res, next) => {
    if (!res.locals.authz_data.has_course_instance_permission_edit) {
      return next(error.make(403, 'Access denied (must be a student data editor)'));
    }
    if (req.body.__action === 'add_manual_grade') {
      const params = [
        req.body.assessment_id,
        null, // assessment_instance_id,
        null, // submission_id
        res.locals.instance_question.id, // instance_question_id,
        null, // uid
        null, // assessment_instance_number
        null, // qid
        req.body.modified_at,
        req.body.submission_score_percent, // score_perc
        null, // points
        { manual: req.body.submission_note }, // feedback
        null, // partial_scores
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
      const update_result = (await sqlDb.callAsync('instance_questions_update_score', params))
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
    } else if (typeof req.body.__action === 'string' && req.body.__action.startsWith('reassign_')) {
      const assigned_grader = req.body.__action.substring(9);
      const params = {
        course_instance_id: res.locals.course_instance.id,
        assessment_id: res.locals.assessment.id,
        instance_question_id: res.locals.instance_question.id,
        assigned_grader: assigned_grader === 'nobody' ? null : assigned_grader,
      };
      await sqlDb.queryAsync(sql.update_assigned_grader, params);

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
