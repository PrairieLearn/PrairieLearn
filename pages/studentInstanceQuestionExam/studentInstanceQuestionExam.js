var ERR = require('async-stacktrace');
var _ = require('lodash');
var express = require('express');
var router = express.Router();

var error = require('../../lib/error');
var question = require('../../lib/question');
var assessment = require('../../lib/assessment');
var sqldb = require('../../lib/sqldb');
var sqlLoader = require('../../lib/sql-loader');
var sql = sqlLoader.loadSqlEquiv(__filename);

function processSubmission(req, res, callback) {
    if (!res.locals.assessment_instance.open) return callback(error.make(400, 'assessment_instance is closed'));
    if (!res.locals.instance_question.open) return callback(error.make(400, 'instance_question is closed'));
    let variant_id, submitted_answer;
    if (res.locals.question.type == 'Freeform') {
        variant_id = req.body.__variant_id;
        submitted_answer = _.omit(req.body, ['__action', '__csrf_token', '__variant_id']);
    } else {
        if (!req.body.postData) return callback(error.make(400, 'No postData', {locals: res.locals, body: req.body}));
        let postData;
        try {
            postData = JSON.parse(req.body.postData);
        } catch (e) {
            return callback(error.make(400, 'JSON parse failed on body.postData', {locals: res.locals, body: req.body}));
        }
        variant_id = postData.variant ? postData.variant.id : null;
        submitted_answer = postData.submittedAnswer;
    }
    const submission = {
        variant_id: variant_id,
        auth_user_id: res.locals.authn_user.user_id,
        submitted_answer: submitted_answer,
        credit: res.locals.authz_result.credit,
        mode: res.locals.authz_data.mode,
    };
    sqldb.callOneRow('variants_ensure_instance_question', [submission.variant_id, res.locals.instance_question.id], (err, result) => {
        if (ERR(err, callback)) return;
        const variant = result.rows[0];
        if (req.body.__action == 'grade') {
            question.saveAndGradeSubmission(submission, variant, res.locals.question, res.locals.course, (err) => {
                if (ERR(err, callback)) return;
                callback(null, submission.variant_id);
            });
        } else if (req.body.__action == 'save') {
            question.saveSubmission(submission, variant, res.locals.question, res.locals.course, (err) => {
                if (ERR(err, callback)) return;
                callback(null, submission.variant_id);
            });
        } else {
            callback(error.make(400, 'unknown __action', {locals: res.locals, body: req.body}));
        }
    });
}

function processIssue(req, res, callback) {
    if (!res.locals.assessment.allow_issue_reporting) return callback(new Error('Issue reporting not permitted for this assessment'));
    const description = req.body.description;
    if (!_.isString(description) || description.length == 0) {
        return callback(new Error('A description of the issue must be provided'));
    }

    const variant_id = req.body.__variant_id;
    sqldb.callOneRow('variants_ensure_instance_question', [variant_id, res.locals.instance_question.id], (err, _result) => {
        if (ERR(err, callback)) return;

        const course_data = _.pick(res.locals, ['variant', 'instance_question',
                                                'question', 'assessment_instance',
                                                'assessment', 'course_instance', 'course']);
        const params = [
            variant_id,
            description, // student message
            'student-reported issue', // instructor message
            true, // manually_reported
            true, // course_caused
            course_data,
            {}, // system_data
            res.locals.authn_user.user_id,
        ];
        sqldb.call('issues_insert_for_variant', params, (err) => {
            if (ERR(err, callback)) return;
            callback(null, variant_id);
        });
    });
}

router.post('/', function(req, res, next) {
    if (res.locals.assessment.type !== 'Exam') return next();
    if (!res.locals.authz_result.authorized_edit) return next(error.make(403, 'Not authorized', res.locals));
    if (req.body.__action == 'grade' || req.body.__action == 'save') {
        if (res.locals.authz_result.time_limit_expired) {
            return next(new Error('time limit is expired, please go back and finish your assessment'));
        }
        return processSubmission(req, res, function(err) {
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
        });
    } else if (req.body.__action == 'timeLimitFinish') {
        var closeExam = true;
        assessment.gradeAssessmentInstance(res.locals.assessment_instance.id, res.locals.authn_user.user_id, closeExam, function(err) {
            if (ERR(err, next)) return;
            res.redirect(res.locals.urlPrefix + '/assessment_instance/' + res.locals.assessment_instance.id + '?timeLimitExpired=true');
        });
    } else if (req.body.__action == 'report_issue') {
        processIssue(req, res, function(err, variant_id) {
            if (ERR(err, next)) return;
            res.redirect(res.locals.urlPrefix + '/instance_question/' + res.locals.instance_question.id
                         + '/?variant_id=' + variant_id);
        });
    } else {
        return next(error.make(400, 'unknown __action', {locals: res.locals, body: req.body}));
    }
});

router.get('/', function(req, res, next) {
    if (res.locals.assessment.type !== 'Exam') return next();
    const variant_id = null;
    question.getAndRenderVariant(variant_id, res.locals, function(err) {
        if (ERR(err, next)) return;
        var insert_viewlog_key = {
          date: new Date(),
          variant_id: res.locals.variant.id,
          };
        sqldb.queryOneRow(sql.log_into_view_log, insert_viewlog_key, function(err){
          if(ERR(err, next)) return;
        });
        var duration_update_key = [res.locals.instance_question_info.id, parseInt(res.locals.variant.authn_user_id)];
        sqldb.callOneRow('instance_questions_interval_update_last_accesses_update', duration_update_key, function(err){
          if(ERR(err, next)) return;
        });
        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    });
});

module.exports = router;
