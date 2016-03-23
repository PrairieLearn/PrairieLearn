var _ = require('underscore');
var models = require('../models');
var Promise = require('bluebird');

module.exports = function(req, res, next) {
    Promise.try(function() {
        // check that the requested test question is in the requested test
        var sql = 'SELECT tq.*'
            + ' FROM test_questions AS tq'
            + ' JOIN zones AS z ON (tq.zone_id = z.id)'
            + ' WHERE tq.id = :testQuestionId'
            + ' AND z.test_id = :testId'
            + ';'
        var params = {
            testQuestionId: req.params.testQuestionId,
            testId: req.params.testId,
        };
        return models.sequelize.query(sql, {replacements: params});
    }).spread(function(results, info) {
        if (results.length != 1) {
            throw Error("no valid test question with id = " + req.params.testQuestionId);
        }
        req.locals = _.extend({
            testQuestion: results[0],
            testQuestionId: req.params.testQuestionId,
        }, req.locals);
        next();
    });
};
