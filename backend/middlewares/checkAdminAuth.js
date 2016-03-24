var models = require('../models');
var Promise = require('bluebird');

module.exports = function(req, res, next) {
    Promise.try(function() {
        var sql = 'SELECT *'
            + ' FROM enrollments AS e'
            + ' JOIN users as u ON (u.id = e.user_id)'
            + ' WHERE e.course_instance_id = :courseInstanceId'
            + ' AND u.uid = :uid'
            + ' AND e.role >= \'TA\''
            + ';'
        var params = {
            uid: req.authUID,
            courseInstanceId: req.params.courseInstanceId,
        };
        return models.sequelize.query(sql, {replacements: params});
    }).spread(function(results, info) {
        if (results.length == 0) {
            return res.status(403).end();
        }
        next();
    });
};
