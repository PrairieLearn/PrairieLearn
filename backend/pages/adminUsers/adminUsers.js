var _ = require('underscore');
var csvStringify = require('csv').stringify;
var express = require('express');
var router = express.Router();

var logger = require('../../logger');
var sqldb = require('../../sqldb');

var csv_filename = function(locals) {
    return locals.course.short_name.replace(/\s+/g, '')
        + '_'
        + locals.semester.short_name
        + '_'
        + 'user_scores.csv';
};

var course_tests_partial
    = ' course_tests AS ('
    + ' )';

var course_tests_sql
    = ' SELECT'
    + '     t.id,t.number AS test_number,'
    + '     ts.number AS test_set_number,ts.color,'
    + '     (ts.abbrev || t.number) AS label'
    + ' FROM tests AS t'
    + ' JOIN test_sets AS ts ON (ts.id = t.test_set_id)'
    + ' WHERE t.deleted_at IS NULL'
    + ' AND t.course_instance_id = $1'
    + ' ORDER BY (ts.number, t.number)'
    + ' ;';

var user_scores_sql = 'WITH'
    + ' course_users AS ('
    + '     SELECT u.id,u.uid,u.name AS user_name,e.role'
    + '     FROM users AS u'
    + '     JOIN enrollments AS e ON (e.user_id = u.id)'
    + '     WHERE e.course_instance_id = $1'
    + ' ),'
    + ' course_tests AS ('
    + '     SELECT t.id,t.number AS test_number,ts.number AS test_set_number'
    + '     FROM tests AS t'
    + '     JOIN test_sets AS ts ON (ts.id = t.test_set_id)'
    + '     WHERE t.deleted_at IS NULL'
    + '     AND t.course_instance_id = $1'
    + ' ),'
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

router.get('/', function(req, res, next) {
    var params = [req.locals.courseInstanceId];
    sqldb.query(course_tests_sql, params, function(err, result) {
        if (err) {logger.error('adminUsers course_tests_sql query failed', err); return res.status(500).end();}
        var course_tests = result.rows;
        sqldb.query(user_scores_sql, params, function(err, result) {
            if (err) {logger.error('adminUsers user_scores_sql query failed', err); return res.status(500).end();}
            var user_scores = result.rows;
            var locals = _.extend({
                course_tests: course_tests,
                user_scores: user_scores,
                csv_filename: csv_filename(req.locals),
            }, req.locals);
            res.render('pages/adminUsers/adminUsers', locals);
        });
    });
});

router.get('/:filename', function(req, res, next) {
    var params = [req.locals.courseInstanceId];
    sqldb.query(course_tests_sql, params, function(err, result) {
        if (err) {logger.error('adminUsers course_tests_sql query failed', err); return res.status(500).end();}
        var course_tests = result.rows;
        sqldb.query(user_scores_sql, params, function(err, result) {
            if (err) {logger.error('adminUsers user_scores_sql query failed', err); return res.status(500).end();}
            var user_scores = result.rows;

            var csvHeaders = ['UID', 'Name', 'Role'].concat(_(course_tests).pluck('label'));
            var csvData = _(user_scores).map(function(row) {
                return [row.uid, row.user_name, row.role].concat(row.scores);
            });
            csvData.splice(0, 0, csvHeaders);
            csvStringify(csvData, function(err, csv) {
                if (err) throw Error("Error formatting CSV", err);
                res.attachment(req.params.filename);
                res.send(csv);
            });
        });
    });
});

module.exports = router;
