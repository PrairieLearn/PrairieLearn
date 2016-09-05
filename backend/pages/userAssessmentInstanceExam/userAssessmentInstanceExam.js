var ERR = require('async-stacktrace');
var _ = require('lodash');
var path = require('path');
var csvStringify = require('csv').stringify;
var express = require('express');
var router = express.Router();

var logger = require('../../logger');
var sqldb = require('../../sqldb');
var sqlLoader = require('../../sql-loader');

var sql = sqlLoader.load(path.join(__dirname, 'userAssessmentInstanceExam.sql'));

router.get('/', function(req, res, next) {
    if (res.locals.assessment.type !== 'Exam' && res.locals.assessment.type !== 'RetryExam') return next(); // FIXME: hack to handle 'RetryExam'
    var params = {
        assessment_instance_id: res.locals.assessmentInstance.id,
        assessment_id: res.locals.assessment.id,
    };
    sqldb.query(sql.update, params, function(err, result) {
        if (ERR(err, next)) return;

        var params = {assessment_instance_id: res.locals.assessmentInstance.id};
        sqldb.query(sql.get_questions, params, function(err, result) {
            if (ERR(err, next)) return;
            res.locals.questions = result.rows;

            res.render(path.join(__dirname, 'userAssessmentInstanceExam'), res.locals);
        });
    });
});

module.exports = router;
