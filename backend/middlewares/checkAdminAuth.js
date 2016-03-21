var models = require('../models');
var Promise = require('bluebird');

module.exports = function(req, res, next) {
    Promise.try(function() {
        var sql = 'SELECT role FROM enrollments'
            + ' WHERE course_instance_id = :courseInstanceId'
            + ' AND role >= \'TA\''
            + ';'
        var params = {
            courseInstanceId: req.params.courseInstanceId,
        };
        return models.sequelize.query(sql, {replacements: params});
    }).spread(function(results, info) {
        if (results.length != 1) {
            return res.status(403).end();
        }
        next();
    });
};
