var Promise = require('bluebird');
var models = require('../models');
var config = require('../config');
var _ = require('underscore');

var express = require('express');
var router = express.Router();

router.get('/', function(req, res, next) {
    Promise.try(function() {
        var course_tests_partial
            = ' course_tests AS ('
            + '     SELECT t.id,t.number AS test_number,'
            + '     ts.number AS test_set_number,ts.color,'
            + '     (ts.short_name || t.number) AS label'
            + '     FROM tests AS t'
            + '     JOIN test_sets AS ts ON (ts.id = t.test_set_id)'
            + '     WHERE t.deleted_at IS NULL'
            + '     AND t.course_instance_id = :courseInstanceId'
            + '     ORDER BY (ts.number, t.number)'
            + ' )';

        var course_tests_sql = 'WITH'
            + course_tests_partial
            + ' SELECT * FROM course_tests;';

        var user_scores_sql = 'WITH'
            + ' course_users AS ('
            + '     SELECT u.id,u.uid,u.name AS user_name,e.role'
            + '     FROM users AS u'
            + '     JOIN enrollments AS e ON (e.user_id = u.id)'
            + '     WHERE e.course_instance_id = :courseInstanceId'
            + '),'
            + course_tests_partial + ','
            + ' user_test_scores AS ('
            + '     SELECT u.id AS user_id,u.uid,u.user_name,u.role,'
            + '         t.id AS test_id,t.test_number,t.test_set_number,'
            + '         MAX(tsc.score_perc) AS score_perc'
            + '     FROM course_users AS u'
            + '     CROSS JOIN course_tests AS t'
            + '     LEFT JOIN ('
            + '         test_instances AS ti'
            + '         JOIN test_scores AS tsc ON (tsc.test_instance_id = ti.id)'
            + '     ) ON (ti.test_id = t.id AND ti.user_id = u.id)'
            + '     GROUP BY u.id,u.uid,u.user_name,u.role,t.id,t.test_number,t.test_set_number'
            + ' )'
            + ' SELECT user_id,uid,user_name,role,'
            + '     ARRAY_AGG(score_perc'
            + '           ORDER BY (test_set_number, test_number)'
            + '     ) AS scores'
            + ' FROM user_test_scores'
            + ' GROUP BY user_id,uid,user_name,role'
            + ' ORDER BY role DESC, uid'
            + ' ;';
        var params = {
            courseInstanceId: req.locals.courseInstanceId,
        };
        return Promise.all([
            models.sequelize.query(course_tests_sql, {replacements: params}),
            models.sequelize.query(user_scores_sql, {replacements: params}),
        ]);
    }).spread(function(course_tests_ret, user_scores_ret) {
        var locals = _.extend({
            course_tests: course_tests_ret[0],
            user_scores: user_scores_ret[0],
        }, req.locals);
        res.render('pages/users', locals);
    });
});

module.exports = router;
