var ERR = require('async-stacktrace');
var _ = require('lodash');
var async = require('async');
var path = require('path');
var csvStringify = require('csv').stringify;
var express = require('express');
var router = express.Router();

var error = require('../../error');
var questionServer = require('../../question-server');
var logger = require('../../logger');
var assessmentExam = require('../../lib/assessment-exam');
var sqldb = require('../../sqldb');
var sqlLoader = require('../../sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

router.post('/', function(req, res, next) {
    if (res.locals.assessment.type !== 'Exam') return next();

    var finishExam;
    if (res.locals.postAction == 'grade') {
        finishExam = false;
    } else if (res.locals.postAction == 'finish') {
        finishExam = true;
    } else {
        return next(error.make(400, 'unknown action: ' + res.locals.postAction, {postAction: res.locals.postAction, postData: res.locals.postData}));
    }
    assessmentExam.gradeExam(res.locals.assessment_instance.id, res.locals.user.id, res.locals.assessment_instance.credit, finishExam, function(err) {
        if (ERR(err, next)) return;
        res.redirect(req.originalUrl);
    });
});

router.get('/', function(req, res, next) {
    if (res.locals.assessment.type !== 'Exam') return next();

    var params = {assessment_instance_id: res.locals.assessment_instance.id};
    sqldb.query(sql.get_questions, params, function(err, result) {
        if (ERR(err, next)) return;
        res.locals.questions = result.rows;
        
        res.render(path.join(__dirname, 'userAssessmentInstanceExam'), res.locals);
    });
});

module.exports = router;
