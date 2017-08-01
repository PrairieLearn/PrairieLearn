var ERR = require('async-stacktrace');
var _ = require('lodash');
var express = require('express');
var router = express.Router();

var error = require('../../lib/error');
var assessmentsExam = require('../../assessments/exam');
var partialsQuestion = require('../partials/question');

function processSubmission(req, res, callback) {
    if (!res.locals.assessment_instance.open) return callback(error.make(400, 'assessment_instance is closed'));
    if (!res.locals.instance_question.open) return callback(error.make(400, 'instance_question is closed'));
    let variant_id, submitted_answer, type = null;
    if (res.locals.question.type == 'Freeform') {
        variant_id = req.body.variant_id;
        submitted_answer = _.omit(req.body, ['postAction', 'csrfToken', 'variant_id']);
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
        type = postData.type;
    }
    const submission = {
        variant_id: variant_id,
        auth_user_id: res.locals.authn_user.user_id,
        submitted_answer: submitted_answer,
        type: type,
        credit: res.locals.authz_result.credit,
        mode: res.locals.authz_data.mode,
    };
    assessmentsExam.save(submission, res.locals.instance_question.id, res.locals.question, res.locals.course, function(err) {
        if (ERR(err, callback)) return;
        callback(null);
    });
}

router.post('/', function(req, res, next) {
    if (res.locals.assessment.type !== 'Exam') return next();
    if (!res.locals.authz_result.authorized_edit) return next(error.make(403, 'Not authorized', res.locals));
    if (req.body.postAction == 'submitQuestionAnswer') {
        if (res.locals.authz_result.time_limit_expired) {
            return next(new Error('time limit is expired, please go back and finish your assessment'));
        }
        return processSubmission(req, res, function(err) {
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
        });
    } else if (req.body.postAction == 'timeLimitFinish') {
        var finishExam = true;
        assessmentsExam.gradeAssessmentInstance(res.locals.assessment_instance.id, res.locals.user.user_id, res.locals.assessment_instance.credit, finishExam, function(err) {
            if (ERR(err, next)) return;
            res.redirect(res.locals.urlPrefix + '/assessment_instance/' + res.locals.assessment_instance.id + '?timeLimitExpired=true');
        });
    } else {
        return next(error.make(400, 'unknown postAction', {locals: res.locals, body: req.body}));
    }
});

router.get('/', function(req, res, next) {
    if (res.locals.assessment.type !== 'Exam') return next();
    const variant_id = null;
    partialsQuestion.getVariant(req, res, variant_id, res.locals.assessment.type, function(err) {
        if (ERR(err, next)) return;
        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    });
});

module.exports = router;
