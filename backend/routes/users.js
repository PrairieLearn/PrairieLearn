var Promise = require('bluebird');
var models = require('../models');
var config = require('../config');
var _ = require('underscore');

var express = require('express');
var router = express.Router();

router.get('/', function(req, res, next) {
    Promise.try(function() {
        var sql = 'SELECT u.id,u.uid,u.name,e.role'
            + ' FROM users AS u'
            + ' JOIN enrollments AS e ON (e.user_id = u.id)'
            + ' WHERE e.course_instance_id = :courseInstanceId'
            + ' ORDER BY e.role DESC, u.uid'
            + ';';
        var params = {
            courseInstanceId: req.locals.courseInstanceId,
        };
        return models.sequelize.query(sql, {replacements: params});
    }).spread(function(results, info) {
        var locals = _.extend({
            results: results,
        }, req.locals);
        res.render('pages/users', locals);
    });
});

module.exports = router;
