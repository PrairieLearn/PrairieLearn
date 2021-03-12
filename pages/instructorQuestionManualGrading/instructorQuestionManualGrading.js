const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();
const path = require('path');
const async = require('async');
const question = require('../../lib/question');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const { error, sqlDb } = require('@prairielearn/prairielib');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');
const sql = sqlLoader.loadSqlEquiv(__filename);

// Other cases to figure out later: question is broken...
router.get('/', (req, res, next) => {
    async.series([
        // Should we move this block into question.js? getAndRenderVariantForGrading
        (callback) => {
            const params = [
                res.locals.instance_question.id,
                res.locals.authn_user.user_id,
            ];
            sqlDb.callZeroOrOneRow('instance_questions_select_manual_grading_objects', params, (err, result) => {
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

                res.locals.instance_question = result.rows[0].instance_question;
                res.locals.question = result.rows[0].question;
                res.locals.variant = result.rows[0].variant;
                res.locals.submission = result.rows[0].submission;
                res.locals.grading_user = result.rows[0].grading_user;
                res.locals.grading_job_conflict = result.rows[0].grading_job_conflict;

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

    const note = req.body.submission_note;
    const score = req.body.submission_score;
    const modifiedAt = req.body.instance_question_modified_at;
    const params = [
        res.locals.instance_question.id,
        res.locals.authn_user.user_id,
        score / 100,
        modifiedAt,
        {manual: note},
    ];

    if (req.body.__action == 'add_manual_grade') {
        sqlDb.callZeroOrOneRow('instance_questions_manually_grade_submission', params, (err, result) => {
            if (ERR(err, next)) return;
            if (result.rows[0].instance_question.manual_grading_conflict) {
                return res.redirect(`${res.locals.urlPrefix}/instance_question/${res.locals.instance_question.id}/manual_grading`);
            }
            res.redirect(`${res.locals.urlPrefix}/assessment/${req.body.assessment_id}/assessment_question/${req.body.assessment_question_id}/next_ungraded`);
        });

    } else if (req.body.__action == 'abort_manual_grading') {
        const params = {
            instance_question_id: res.locals.instance_question.id,
        };
        const url = `${res.locals.urlPrefix}/assessment/${res.locals.assessment.id}/manual_grading`;
    
        sqlDb.queryZeroOrOneRow(sql.instance_question_abort_manual_grading, params, function(err) {
            if (ERR(err, next)) return next(error.make(500, `Cannot find instance question: ${res.locals.instance_question_id}`));
            res.redirect(url);
        });
    } else if (req.body.__action == 'accept_manual_grade_conflict') {
        sqlDb.callZeroOrOneRow('instance_questions_manually_grade_submission', params, (err) => {
            if (ERR(err, next)) return;
            res.redirect(`${res.locals.urlPrefix}/assessment/${req.body.assessment_id}/assessment_question/${req.body.assessment_question_id}/next_ungraded`);
        });
    } else {
        return next(error.make(400, 'unknown __action', {locals: res.locals, body: req.body}));
    }
});
module.exports = router;
