var _ = require('underscore');
var models = require('../models');
var Promise = require('bluebird');

module.exports = function(req, res, next) {
    Promise.try(function() {
        // check that the requested question is in the current course
        var sql = 'SELECT q.*'
            + ' FROM questions AS q'
            + ' JOIN courses AS c ON (c.id = q.course_id)'
            + ' JOIN course_instances AS ci ON (ci.course_id = c.id)'
            + ' WHERE q.id = :questionId'
            + ' AND q.deleted_at IS NULL'
            + ' AND ci.id = :courseInstanceId'
            + ';'
        var params = {
            questionId: req.params.questionId,
            courseInstanceId: req.params.courseInstanceId,
        };
        return models.sequelize.query(sql, {replacements: params});
    }).spread(function(results, info) {
        if (results.length != 1) {
            throw Error("no valid question with id = " + req.params.questionId);
        }
        req.locals = _.extend({
            question: results[0],
            questionId: req.params.questionId,
        }, req.locals);
        next();
    });
};
