const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();
const path = require('path');
const async = require('async');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const question = require('../../lib/question');
const logPageView = require('../../middlewares/logPageView')(path.basename(__filename, '.js'));
const { error, sqlDb, sqlLoader} = require('@prairielearn/prairielib');
const fs = require('fs-extra');

const sql = sqlLoader.loadSqlEquiv(__filename);

class NoSubmissionError extends Error {
    constructor(message) {
      super(message);
      this.name = 'NoSubmissionError';
    }
  }

// TODO:
// eslint-disable-next-line no-unused-vars
router.get('/', (req, res, next) => {
    const params = [res.locals.instance_question.id];
    console.log(res.locals);
    async.series([
        // First, grab the most recent variant associated with this instance question for this assessment
        (callback) => 
            sqlDb.callZeroOrOneRow('variants_select_question_and_last_submission', params, (err, result) => {
                if (ERR(err, next)) return;
                if (result.rowCount == 0) return new NoSubmissionError();
                res.locals['submission'] = result.rows[0];
                res.locals.variant_id = result.rows[0].variant.id;
                callback(null);
            }),
        // Grab the question data so we can render the question body
        (callback) => {
            res.locals.overlayGradingInterface = true;
            question.getAndRenderVariant(res.locals.variant_id, null, res.locals, function (
              err,
            ) {
              if (ERR(err, callback)) return;
              debug(`found question data`);
              console.log('found question');

              callback(null);
            });
        },
        // Log the page view
        (callback) => {
            logPageView(req, res, (err) => {
                if (ERR(err, next)) return;
                callback(null);
            });
        },
    ], (err) => {
        if (ERR(err, next)) return;
        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    });

    debug('GET /');
});

// TODO:
router.post('/', function(req, res, next) {
    if (req.body.__action == 'add_manual_grade') {
        const submission_id = req.body['submission-id'];
        const note = req.body['submission-note'];
        const score = req.body['submission-score'];
        const params = {instance_question_id: res.locals.instance_question_id};

        sqlDb.query(sql.instance_question_select_last_variant_with_submission, params, (err, result) => {
            if (ERR(err, next)) return;
            if (result.rowCount == 0) throw new Error('Instance question not found');
    
            const variant_id = result.rows[0].id;
    
            sqlDb.queryOneRow(sql.instance_question_select_question, params, (err, result) => {
                if (ERR(err, next)) return;
                if (result.rowCount == 0) throw new Error('Question not found');
                res.locals.question = result.rows[0];

                const params = [variant_id, null, true];

                sqlDb.callZeroOrOneRow('variants_select_submission_for_grading', params, (err, result) => {
                    if (ERR(err, next)) return;
                    if (result.rowCount == 0) return new NoSubmissionError();
                    const submission = result.rows[0];
                    res.locals['submission'] = submission;
                    
                    sqlDb.callZeroOrOneRow('submissions_select', [submission_id], (err, result) => {
                        if (ERR(err, next)) return;
                        if (result.rowCount == 0) return new NoSubmissionError();
                        const submission = result.rows[0];
                        res.locals['submission'] = submission;
                        res.locals['submission_updated'] = true;
                        debug('_gradeVariantWithClient()', 'selected submission', 'submission.id:', submission.id);

                        const params = [
                            submission.id,
                            res.locals.authn_user.user_id,
                            submission.gradable,
                            submission.broken,
                            submission.format_errors,
                            submission.partial_scores,
                            score, // overwrite submission score
                            submission.v2_score,
                            {feedback:note}, // overwrite feedback
                            submission.submitted_answer,
                            submission.params,
                            submission.true_answer,
                        ];
                    
                        sqlDb.callOneRow('grading_jobs_insert', params, (err, result) => {
                            if (ERR(err, next)) return;
                    
                            /* If the submission was marked invalid during grading the grading job will
                               be marked ungradable and we should bail here to prevent LTI updates. */
                            res.locals['grading_job'] = result.rows[0];
                            if (!res.locals['grading_job'].gradable) return next(new NoSubmissionError());
                    
                            debug('_gradeVariantWithClient()', 'inserted', 'grading_job.id:', res.locals['grading_job'].id);
                            res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
                        });
                    });
                });
            });
        });
    } else if (req.body.__action == 'update_manual_grade') {
        //
    } else {
        return next(error.make(400, 'unknown __action', {locals: res.locals, body: req.body}));
    }
});
module.exports = router;