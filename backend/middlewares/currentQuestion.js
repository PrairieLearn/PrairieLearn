var _ = require('underscore');
var path = require('path');
var logger = require('../logger');
var sqldb = require('../sqldb');
var sqlLoader = require('../sql-loader');

var sql = sqlLoader.load(path.join(__dirname, 'currentQuestion.sql'));

module.exports = function(req, res, next) {
    var params = [req.params.questionId, req.params.courseInstanceId];
    sqldb.query(sql.all, params, function(err, result) {
        if (err) {logger.error('currentQuestion query failed', err); return res.status(500).end();}
        if (result.rowCount !== 1) return res.status(404).end();
        req.locals = _.extend({
            question: result.rows[0],
            questionId: req.params.questionId,
        }, req.locals);
        next();
    });
};
