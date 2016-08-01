var ERR = require('async-stacktrace');
var _ = require('underscore');
var path = require('path');
var logger = require('../logger');
var sqldb = require('../sqldb');
var sqlLoader = require('../sql-loader');

var sql = sqlLoader.load(path.join(__dirname, 'currentQuestion.sql'));

module.exports = function(req, res, next) {
    var params = [req.params.questionId, req.params.courseInstanceId];
    sqldb.queryOneRow(sql.all, params, function(err, result) {
        if (ERR(err, next)) return;
        req.locals = _.extend({
            question: result.rows[0],
            questionId: req.params.questionId,
        }, req.locals);
        next();
    });
};
