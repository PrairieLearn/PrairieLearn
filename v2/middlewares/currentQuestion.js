var ERR = require('async-stacktrace');
var _ = require('lodash');
var path = require('path');
var logger = require('../logger');
var sqldb = require('../sqldb');
var sqlLoader = require('../sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

module.exports = function(req, res, next) {
    var params = {
        question_id: res.locals.questionId ? res.locals.questionId : req.params.questionId,
        course_instance_id: req.params.courseInstanceId,
    };
    sqldb.queryOneRow(sql.all, params, function(err, result) {
        if (ERR(err, next)) return;
        res.locals.question = result.rows[0];
        res.locals.questionId = res.locals.question.id;
        next();
    });
};
