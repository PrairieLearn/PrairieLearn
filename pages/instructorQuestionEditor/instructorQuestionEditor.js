var ERR = require('async-stacktrace');
var _ = require('lodash');
var express = require('express');
var router = express.Router();
var fs = require('fs');
var path = require('path');

var error = require('../../lib/error');
var question = require('../../lib/question');
var sqldb = require('../../lib/sqldb');

var validFile = {
    'question.html': true,
    'server.py': true
}

function processSubmission(req, res, callback) {
    let variant_id,
        submitted_answer;

    if (Array.isArray(req.body.form)) {
        req.body.form.forEach(function(formItem) {
            req.body[formItem.name] = formItem.value;
        });
    }

    variant_id = req.body.__variant_id;
    submitted_answer = _.omit(req.body, ['action', '__action', '__csrf_token', '__variant_id']);

    const submission = {
        variant_id: variant_id,
        auth_user_id: res.locals.authn_user.user_id,
        submitted_answer: submitted_answer,
    };
    sqldb.callOneRow('variants_ensure_question', [submission.variant_id, res.locals.question.id], (err, result) => {
        if (ERR(err, callback)) return;
        const variant = result.rows[0];
        question.saveAndGradeSubmission(submission, variant, res.locals.question, res.locals.course, (err) => {
            if (ERR(err, callback)) return;
            question.getAndRenderVariant(submission.variant_id, res.locals, function(err) {
                if (ERR(err, callback)) return;
                res.locals.question_context = 'student_homework';
                res.locals.instance_question_info = res.locals.question;
                res.locals.assessment_question = { tries_per_variant: 1 };
                res.render(path.join(__filename, '../../partials/question.ejs'), res.locals);
            });
        });
    });
}

// This route is called asynchronously by the editor to update disk contents and
// update the preview with variants.
router.post('/', function(req, res, next) {
    var questionPath = path.join(res.locals.course.path, 'questions', res.locals.question.qid);

    if (req.body.action == 'grade') {
        processSubmission(req, res, function(err, variant_id) {
            if (ERR(err, next)) return;
        });
    }
    else if (req.body.action == 'save') {
        var fileName = req.body.file;

        if (validFile[fileName]) {
            fs.writeFile(path.join(questionPath, fileName), req.body.content,
            function(err) {
                res.send((err) ? 'error' : 'success');
            });
        }
        else {
            res.send('error');
        }
    }
    else if (req.body.action == 'preview') {
        question.getAndRenderVariant(null, res.locals, function(err) {
            res.locals.question_context = 'student_homework';
            res.locals.instance_question_info = res.locals.question;
            res.locals.assessment_question = { tries_per_variant: 1 };
            res.render(path.join(__filename, '../../partials/question.ejs'), res.locals);
        });
    }
    else {
        res.send('error');
    }
});

router.get('/', function(req, res, next) {
    var questionPath = path.join(res.locals.course.path, 'questions', res.locals.question.qid);

    fs.readFile(path.join(questionPath, 'question.html'), 'utf-8', function(questionErr, questionHtml) {
    fs.readFile(path.join(questionPath, 'info.json'), 'utf-8', function(jsonErr, infoJson) {
    fs.readFile(path.join(questionPath, 'server.py'), 'utf-8', function(serverErr, serverPython) {
    fs.readdir(path.join(questionPath, 'clientFilesQuestion'), function(questionFilesErr, questionFiles) {
    fs.readdir(path.join(res.locals.course.path, 'clientFilesCourse'), function(courseFilesErr, courseFiles) {

        res.locals.questionFiles = (questionFilesErr) ? [] : questionFiles;
        res.locals.courseFiles = (courseFilesErr) ? [] : courseFiles;
        res.locals.questionHtml = (questionErr) ? '' : questionHtml;
        res.locals.infoJson = (jsonErr) ? {} : JSON.parse(infoJson);
        res.locals.serverPython = (serverErr) ? '' : serverPython;

        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);

    }); }); }); }); });

    //res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
});

module.exports = router;
