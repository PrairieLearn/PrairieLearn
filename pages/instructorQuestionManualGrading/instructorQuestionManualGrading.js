const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();
const path = require('path');
const async = require('async');
const question = require('../../lib/question');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const error = require('../../prairielib/lib/error');
const sqlDb = require('../../prairielib/lib/sql-db');
const ltiOutcomes = require('../../lib/ltiOutcomes');
const logger = require('../../lib/logger');

// Other cases to figure out later: grading in progress, question is broken...
router.get('/', (req, res, next) => {
  async.series(
    [
      // Should we move this block into question.js? getAndRenderVariantForGrading
      (callback) => {
        const params = [res.locals.instance_question.id];
        sqlDb.callZeroOrOneRow(
          'instance_question_select_manual_grading_objects',
          params,
          (err, result) => {
            if (ERR(err, next)) return;
            // Instance question doesn't exist (redirect to config page)
            if (result.rowCount === 0) {
              return callback(
                error.make(404, 'Instance question not found.', {
                  locals: res.locals,
                  body: req.body,
                })
              );
            }

            /**
             * Student never loaded question (variant and submission is null)
             * Student loaded question but did not submit anything (submission is null)
             */
            if (!result.rows[0].variant || !result.rows[0].submission) {
              return callback(
                error.make(404, 'No gradable submissions found.', {
                  locals: res.locals,
                  body: req.body,
                })
              );
            }

            logger.info('QuestionManualGrading: Found Question To Grade in DB.', {
              instance_question_id: res.locals.instance_question.id,
              result_row: result.rows[0],
            });
            res.locals.question = result.rows[0].question;
            res.locals.variant = result.rows[0].variant;
            res.locals.submission = result.rows[0].submission;
            res.locals.max_points = result.rows[0].max_points;
            res.locals.score_perc = res.locals.submission.score * 100;
            callback(null);
          }
        );
      },
      (callback) => {
        res.locals.overlayGradingInterface = true;
        logger.info('QuestionManualGrading: About to render question for grading.', {
          instance_question_id: res.locals.instance_question.id,
          question: res.locals.question,
          variant: res.locals.variant,
          submission: res.locals.submission,
        });
        question.getAndRenderVariant(res.locals.variant.id, null, res.locals, function (err) {
          if (ERR(err, next)) return;
          logger.info('QuestionManualGrading: Question Rendered.', {
            instance_question_id: res.locals.instance_question.id,
            question: res.locals.question,
            variant: res.locals.variant,
            submission: res.locals.submission,
          });
          callback(null);
        });
      },
    ],
    (err) => {
      if (ERR(err, next)) return;
      res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    }
  );

  debug('GET /');
});

router.post('/', function (req, res, next) {
  if (req.body.__action === 'add_manual_grade') {
    const note = req.body.submission_note;
    const score_perc = req.body.submission_score_percent;
    const params = [res.locals.instance_question.id];

    sqlDb.callZeroOrOneRow(
      'instance_question_select_manual_grading_objects',
      params,
      (err, result) => {
        if (ERR(err, next)) return;

        const { question, variant, submission } = result.rows[0];
        if (!question || !variant || !submission) {
          return next(error.make('500', 'Manual grading dependencies missing'));
        }

        Object.assign(res.locals, { question, variant, submission });

        const params = [
          req.body.assessment_id,
          null, // assessment_instance_id,
          submission.id, // submission_id
          null, // instance_question_id,
          null, // uid
          null, // assessment_instance_number
          null, // qid
          score_perc,
          null, // points
          { manual: note }, // feedback
          null, // partial_scores
          res.locals.authn_user.user_id,
        ];

        /**
         *  TODO: calling 'instance_questions_update_score' may not be the perfect thing to do
         * here, because it won't respect the 'credit' property of the assessment_instance.
         * However, allowing the 'credit' calculation in a manually graded problem is also problematic,
         * because it means that the behavior of the instructor editing the score on the manual grading
         * page would be different than the behavior of the instructor editing the score on any of the other
         * pages where they can edit score. Fundamentally, we need to rethink how to treat questions
         * that are manually graded within PrairieLearn and how to handle those score calculations.
         */
        sqlDb.call('instance_questions_update_score', params, (err, _result) => {
          if (ERR(err, next)) return;
          ltiOutcomes.updateScore(req.body.assessment_instance_id, null, (err) => {
            if (ERR(err, next)) return;
            res.redirect(
              `${res.locals.urlPrefix}/assessment/${req.body.assessment_id}/assessment_question/${req.body.assessment_question_id}/next_ungraded?instance_question=${res.locals.instance_question.id}`
            );
          });
        });
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
