var ERR = require('async-stacktrace');
var _ = require('lodash');
var path = require('path');
var logger = require('../lib/logger');
var sqldb = require('../lib/sqldb');
var sqlLoader = require('../lib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

module.exports = function(req, res, next) {
    var params = {
        assessment_question_id: res.locals.assessmentQuestionId ? res.locals.assessmentQuestionId : req.params.assessmentQuestionId,
        assessment_id: res.locals.assessmentId,
    };
    sqldb.queryOneRow(sql.all, params, function(err, result) {
        if (ERR(err, next)) return;
        res.locals.assessmentQuestion = result.rows[0];
        res.locals.assessmentQuestionId = res.locals.assessmentQuestion.id;
        next();
    });
};
