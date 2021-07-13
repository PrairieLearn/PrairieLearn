const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();
const path = require('path');
const async = require('async');
const config = require('../../lib/config');
const question = require('../../lib/question');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const error = require('../../prairielib/lib/error');
const sqlLoader = require('../prairielib/lib/sql-loader');
const sqlDb = require('../../prairielib/lib/sql-db');
const sql = sqlLoader.loadSqlEquiv(__filename);

// Other cases to figure out later: question is broken...
router.get('/', (req, res, next) => {
    async.series([
        (callback) => {
            const params = [
                res.locals.instance_question.id,
                res.locals.authn_user.user_id,
                res.locals.conflicting_grading_job_id,
                `${config.manualGradingExpirySec} seconds`,
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

                if (result.rows[0].incoming_conflict) {
                    res.locals.conflict_diff = {
                        grading_job_id: result.rows[0].incoming_conflict.id,
                        existing: {
                            diffType: 'submission',
                            feedback: result.rows[0].submission.feedback,
                            score: result.rows[0].submission.score,
                            graded_by: `${result.rows[0].grading_user.name} (${result.rows[0].grading_user.uid})`,
                        },
                        incoming: result.rows[0].incoming_conflict,
                    };
                }

                callback(null);
            });
        },
       (callback) => {
            res.locals.overlayGradingInterface = true;
            question.getAndRenderVariant(res.locals.variant.id, null, res.locals, (err) => {
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
    const note = req.body.submissionNote;
    const score = req.body.submissionScore;
    const modifiedAt = req.body.instanceQuestionModifiedAt;
    const assessmentId = req.body.assessmentId;
    const assessmentQuestionId = req.body.assessmentQuestionId;
    const gradingJobId = req.body.gradingJobId;

    const params = [
        res.locals.instance_question.id,
        res.locals.authn_user.user_id,
        score / 100,
        modifiedAt,
        {manual: note},
        gradingJobId,
    ];

    if (req.body.__action == 'add_manual_grade') {
        if (typeof note !== 'string') { return ERR(new Error('submissionNote must be valid string', next)); }
        if (score % 5 !== 0) { return ERR(new Error('submissionScore percentage must be divisible by 5', next)); }

        sqlDb.callZeroOrOneRow('instance_questions_manually_grade_submission', params, (err, result) => {
            if (ERR(err, next)) return;
            if (result.rows[0].grading_job.manual_grading_conflict) {
                return res.redirect(`${res.locals.urlPrefix}/instance_question/${res.locals.instance_question.id}/manual_grading?conflicting_grading_job=${result.rows[0].grading_job.id}`);
            }
            res.redirect(`${res.locals.urlPrefix}/assessment/${assessmentId}/assessment_question/${assessmentQuestionId}/next_ungraded`);
        });
    } else if (req.body.__action == 'abort_manual_grading') {
        res.redirect(`${res.locals.urlPrefix}/assessment/${res.locals.assessment.id}/manual_grading`);
    } else if (req.body.__action == 'resolve_manual_grading_conflict') {
        // do not grade submission obj conflicts payloads again
        if (req.body.diffType === 'submission') {
            sqlDb.queryOneRow(sql.remove_grading_job_conflict, {id: gradingJobId}, (err) => {
                if (ERR(err, next)) return;
                res.redirect(`${res.locals.urlPrefix}/assessment/${assessmentId}/assessment_question/${assessmentQuestionId}/next_ungraded`);
            });
        } else {
            sqlDb.callZeroOrOneRow('instance_questions_manually_grade_submission', params, (err, result) => {
                if (ERR(err, next)) return;
                if (result.rows[0].grading_job.manual_grading_conflict) {
                    return res.redirect(`${res.locals.urlPrefix}/instance_question/${res.locals.instance_question.id}/manual_grading?conflicting_grading_job=${result.rows[0].grading_job.id}`);
                }
                res.redirect(`${res.locals.urlPrefix}/assessment/${assessmentId}/assessment_question/${assessmentQuestionId}/next_ungraded`);
            });
        }
    } else {
        return next(error.make(400, 'unknown __action', {locals: res.locals, body: req.body}));
    }
});
module.exports = router;
