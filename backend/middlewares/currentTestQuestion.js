var ERR = require('async-stacktrace');
var _ = require('lodash');
var path = require('path');
var logger = require('../logger');
var sqldb = require('../sqldb');
var sqlLoader = require('../sql-loader');

var sql = sqlLoader.load(path.join(__dirname, 'currentTestQuestion.sql'));

module.exports = function(req, res, next) {
    var params = {
        test_question_id: res.locals.testQuestionId ? res.locals.testQuestionId : req.params.testQuestionId,
        test_id: res.locals.testId,
    };
    sqldb.queryOneRow(sql.all, params, function(err, result) {
        if (ERR(err, next)) return;
        res.locals.testQuestion = result.rows[0];
        res.locals.testQuestionId = res.locals.testQuestion.id;
        next();
    });
};
