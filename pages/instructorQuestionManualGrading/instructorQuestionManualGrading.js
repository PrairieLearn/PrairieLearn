const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const util = require('util');
const question = require('../../lib/question');
const error = require('../../prairielib/lib/error');
const sqlDb = require('../../prairielib/lib/sql-db');
const ltiOutcomes = require('../../lib/ltiOutcomes');
const manualGrading = require('../../lib/manualGrading');

// Other cases to figure out later: grading in progress, question is broken...
router.get(
  '/',
  asyncHandler(async (req, res, next) => {
    // Should we move this block into question.js? getAndRenderVariantForGrading
    const result = await sqlDb.callZeroOrOneRowAsync(
      'instance_question_select_manual_grading_objects',
      [res.locals.instance_question.id]
    );

    /**
     * Student never loaded question (variant and submission is null)
     * Student loaded question but did not submit anything (submission is null)
     */
    if (!result.rows[0]?.variant || !result.rows[0]?.submission) {
      return next(
        error.make(404, 'No gradable submissions found.', {
          locals: res.locals,
          body: req.body,
        })
      );
    }

    res.locals.question = result.rows[0].question;
    res.locals.variant = result.rows[0].variant;
    res.locals.submission = result.rows[0].submission;
    res.locals.max_points = result.rows[0].max_points;
    res.locals.score_perc = res.locals.submission.score * 100;

    res.locals.overlayGradingInterface = true;
    await util.promisify(question.getAndRenderVariant)(res.locals.variant.id, null, res.locals);
    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
  })
);

router.post(
  '/',
  asyncHandler(async (req, res, next) => {
    if (req.body.__action === 'add_manual_grade') {
      const params = [
        req.body.assessment_id,
        null, // assessment_instance_id,
        null, // submission_id
        res.locals.instance_question.id, // instance_question_id,
        null, // uid
        null, // assessment_instance_number
        null, // qid
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
      await sqlDb.callAsync('instance_questions_update_score', params);
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
