const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();
const path = require('path');
const async = require('async');
const question = require('../../lib/question');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const { error, sqlDb } = require('@prairielearn/prairielib');

// Other cases to figure out later: grading in progress, question is broken...
router.get('/', (req, res, next) => {
    async.series([
        // Should we move this block into question.js? getAndRenderVariantForGrading
        (callback) => {
            const params = [res.locals.instance_question.id];
            sqlDb.callZeroOrOneRow('instance_question_select_manual_grading_objects', params, (err, result) => {
                if (ERR(err, next)) return;

                // Instance question doesn't exist (redirect to config page)
                if (result.rowCount == 0) {
                    return callback(error.make(404, 'Instance question not found.', {locals: res.locals, body: req.body}));
                }

                /**
                 * Student never loaded question (variant and submission is null)
                 * Student loaded question but did not submit anything (submission is null)
                 */
                if (!result.rows[0].variant || !result.rows[0].submission) {
                    return callback(error.make(404, 'No gradable submissions found.', {locals: res.locals, body: req.body}));
                }

                res.locals.question = result.rows[0].question;
                res.locals.variant = result.rows[0].variant;
                res.locals.submission = result.rows[0].submission;
                res.locals.score_perc = res.locals.submission.score * 100;
                callback(null);
            });
        },
       (callback) => {
            res.locals.overlayGradingInterface = true;
            question.getAndRenderVariant(res.locals.variant.id, null, res.locals, function (err) {
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

router.post('/', function(req, res, next) {
    if (req.body.__action == 'add_manual_grade') {
        const note = req.body.submission_note;
        const score = req.body.submission_score;
        const params = [res.locals.instance_question.id];

        sqlDb.callZeroOrOneRow('instance_question_select_manual_grading_objects', params, (err, result) => {
            if (ERR(err, next)) return;

            const {question, variant, submission} = result.rows[0];
            if (!question || !variant || !submission) return next(error.make('500', 'Manual grading dependencies missing'));

            Object.assign(res.locals, {question, variant, submission});

            const params = [
                submission.id,
                res.locals.authn_user.user_id,
                submission.gradable,
                submission.broken,
                submission.format_errors,
                submission.partial_scores,
                score / 100, // overwrite submission score
                submission.v2_score,
                {manual:note}, // overwrite feedback
                submission.submitted_answer,
                submission.params,
                submission.true_answer,
            ];

            sqlDb.callOneRow('grading_jobs_insert_internal', params, (err, result) => {
                if (ERR(err, next)) return;

                /* If the submission was marked invalid during grading the grading job will
                   be marked ungradable and we should bail here to prevent LTI updates. */
                res.locals['grading_job'] = result.rows[0];
                if (!res.locals['grading_job'].gradable) return next(error.make(400, 'Invalid submission error'));

                res.locals['submission_updated'] = true;
                debug('_gradeVariantWithClient()', 'inserted', 'grading_job.id:', res.locals['grading_job'].id);
                res.redirect(`${res.locals.urlPrefix}/assessment/${req.body.assessment_id}/assessment_question/${req.body.assessment_question_id}/next_ungraded`);
            });

        });
    } else if (req.body.__action == 'update_manual_grade') {
        // TODO: Update grade in DB?

    } else {
        return next(error.make(400, 'unknown __action', {locals: res.locals, body: req.body}));
    }
});
module.exports = router;
