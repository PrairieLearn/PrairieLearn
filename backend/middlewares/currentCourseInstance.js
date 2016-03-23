var _ = require('underscore');
var models = require('../models');
var Promise = require('bluebird');

module.exports = function(req, res, next) {
    Promise.try(function() {
        var sql = 'SELECT ci.*'
            + ' FROM course_instances AS ci'
            + ' WHERE ci.id = :courseInstanceId'
            + ';'
        var params = {
            courseInstanceId: req.params.courseInstanceId,
        };
        return models.sequelize.query(sql, {replacements: params});
    }).spread(function(results, info) {
        if (results.length != 1) {
            throw Error("no course_instance with id = " + req.params.courseInstanceId);
        }
        req.locals = _.extend({
            courseInstance: results[0],
            courseInstanceId: req.params.courseInstanceId,
        }, req.locals);
        next();
    });
};
