var ERR = require('async-stacktrace');
var _ = require('underscore');
var path = require('path');
var logger = require('../logger');
var sqldb = require('../sqldb');
var sqlLoader = require('../sql-loader');

var sql = sqlLoader.load(path.join(__dirname, 'currentInstanceQuestion.sql'));

module.exports = function(req, res, next) {
    var params = {
        instance_question_id: req.params.instanceQuestionId,
    };
    sqldb.queryOneRow(sql.all, params, function(err, result) {
        if (ERR(err, next)) return;
        req.locals.instanceQuestion = result.rows[0];
        req.locals.testInstanceId = req.locals.instanceQuestion.test_instance_id;
        req.locals.questionId = req.locals.instanceQuestion.question_id;
        next();
    });
};
