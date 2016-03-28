var Promise = require('bluebird');
var models = require('../models');
var config = require('../config');
var _ = require('underscore');

var express = require('express');
var router = express.Router();

router.get('/', function(req, res, next) {
    Promise.try(function() {
        var sql = 'WITH'
            + ' courses_with_date AS ('
            + '     SELECT c.id,c.short_name,c.title,max(s.end_date) AS max_end_date'
            + '     FROM course_instances AS ci'
            + '     JOIN courses AS c ON (c.id = ci.course_id)'
            + '     JOIN semesters AS s ON (s.id = ci.semester_id)'
            + '     JOIN enrollments AS e ON (e.course_instance_id = ci.id)'
            + '     JOIN users AS u ON (u.id = e.user_id)'
            + '     WHERE u.uid = :uid'
            + '     AND e.role >= \'TA\''
            + '     GROUP BY c.id,c.short_name,c.title'
            + ' )'
            + ' SELECT current_ci.id AS course_instance_id,c.id AS course_id,c.short_name,c.title,'
            + '     current_s.long_name AS semester_long_name,'
            + '     JSONB_AGG(JSONB_BUILD_OBJECT('
            + '             \'long_name\',s.long_name,'
            + '             \'course_instance_id\',ci.id)'
            + '           ORDER BY s.end_date DESC)'
            + '       AS other_semesters'
            + ' FROM courses_with_date AS c'
            + ' LEFT JOIN semesters AS current_s ON (current_s.end_date = c.max_end_date)'
            + ' LEFT JOIN course_instances AS current_ci ON ('
            + '     current_ci.course_id = c.id'
            + '     AND current_ci.semester_id = current_s.id'
            + ' )'
            + ' JOIN course_instances AS ci ON (c.id = ci.course_id)'
            + ' JOIN semesters AS s ON (s.id = ci.semester_id)'
            + ' GROUP BY current_ci.id,c.id,c.short_name,c.title,current_s.long_name'
            + ' ORDER BY c.short_name,c.title'
            + ';';
        var params = {
            uid: req.authUID,
        };
        return models.sequelize.query(sql, {replacements: params});
    }).spread(function(results, info) {
        var locals = _.extend({
            results: results,
        }, req.locals);
        res.render('pages/index', locals);
    });
});

module.exports = router;
