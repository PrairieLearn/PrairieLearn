var ERR = require('async-stacktrace');
var _ = require('lodash');
var path = require('path');
var logger = require('../lib/logger');
var sqldb = require('../lib/sqldb');
var sqlLoader = require('../lib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

module.exports = function(req, res, next) {
    var params = {
        instance_question_id: req.params.instanceQuestionId,
    };
    sqldb.queryOneRow(sql.all, params, function(err, result) {
        if (ERR(err, next)) return;
        res.locals.instanceQuestion = result.rows[0];
        res.locals.assessmentInstanceId = res.locals.instanceQuestion.assessment_instance_id;
        res.locals.assessmentQuestionId = res.locals.instanceQuestion.assessment_question_id;
        res.locals.questionId = res.locals.instanceQuestion.question_id;
        next();
    });
};
