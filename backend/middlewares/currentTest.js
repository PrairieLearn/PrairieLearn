var _ = require('underscore');
var models = require('../models');
var Promise = require('bluebird');

module.exports = function(req, res, next) {
    Promise.try(function() {
        var sql = 'SELECT t.*'
            + ' FROM tests as t'
            + ' JOIN test_sets AS ts ON (ts.id = t.test_set_id)'
            + ' WHERE t.id = :testId'
            + ' AND t.deleted_at IS NULL'
            + ' AND ts.course_instance_id = :courseInstanceId'
            + ';'
        var params = {
            testId: req.params.testId,
            courseInstanceId: req.params.courseInstanceId,
        };
        return models.sequelize.query(sql, {replacements: params});
    }).spread(function(results, info) {
        if (results.length != 1) {
            throw Error("no valid test with test_id = " + req.params.testId);
        }
        req.locals = _.extend({
            test: results[0],
            testId: req.params.testId,
        }, req.locals);
        var sql = 'SELECT ts.*'
            + ' FROM tests as t'
            + ' JOIN test_sets AS ts ON (ts.id = t.test_set_id)'
            + ' WHERE t.id = :testId'
            + ' AND ts.course_instance_id = :courseInstanceId'
            + ';'
        var params = {
            testId: req.params.testId,
            courseInstanceId: req.params.courseInstanceId,
        };
        return models.sequelize.query(sql, {replacements: params});
    }).spread(function(results, info) {
        if (results.length != 1) {
            throw Error("no valid test with test_id = " + req.params.testId);
        }
        req.locals = _.extend({
            testSet: results[0],
        }, req.locals);
    }).then(function() {
        next();
    });
};
