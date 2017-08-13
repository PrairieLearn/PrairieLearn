var ERR = require('async-stacktrace');
var _ = require('lodash');
var express = require('express');
var router = express.Router();

var error = require('../../lib/error');
var question = require('../../lib/question');
var sqldb = require('../../lib/sqldb');

function processSubmission(req, res, callback) {
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
    };
    sqldb.callOneRow('variants_ensure_question', [submission.variant_id, res.locals.question.id], (err, result) => {
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

router.post('/', function(req, res, next) {
    processSubmission(req, res, function(err, variant_id) {
        if (ERR(err, next)) return;
        res.redirect(res.locals.urlPrefix + '/question/' + res.locals.question.id
                     + '/?variant_id=' + variant_id);
    });
});

router.get('/', function(req, res, next) {
    // req.query.variant_id might be undefined, which will generate a new variant
    question.getAndRenderVariant(req.query.variant_id, res.locals, function(err) {
        if (ERR(err, next)) return;
        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    });
});

module.exports = router;
