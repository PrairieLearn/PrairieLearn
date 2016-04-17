var Promise = require('bluebird');
var models = require('../models');
var config = require('../config');
var _ = require('underscore');
var csvStringify = require('csv').stringify;

var express = require('express');
var router = express.Router();

var scoreStatsCsvFilename = function(locals) {
    return locals.course.short_name.replace(/\s+/g, '')
        + '_'
        + locals.semester.short_name
        + '_'
        + locals.testSet.short_name
        + locals.test.number
        + '_'
        + 'score_stats.csv';
};

var durationStatsCsvFilename = function(locals) {
    return locals.course.short_name.replace(/\s+/g, '')
        + '_'
        + locals.semester.short_name
        + '_'
        + locals.testSet.short_name
        + locals.test.number
        + '_'
        + 'duration_stats.csv';
};

var scoresCsvFilename = function(locals) {
    return locals.course.short_name.replace(/\s+/g, '')
        + '_'
        + locals.semester.short_name
        + '_'
        + locals.testSet.short_name
        + locals.test.number
        + '_'
        + 'scores.csv';
};

router.get('/', function(req, res, next) {
    var locals = _.extend({
        scoreStatsCsvFilename: scoreStatsCsvFilename(req.locals),
        durationStatsCsvFilename: durationStatsCsvFilename(req.locals),
        scoresCsvFilename: scoresCsvFilename(req.locals),
    }, req.locals);
    Promise.try(function() {
        var sql
            = ' WITH'
            + ' test_questions_list AS ('
            + '     SELECT tq.*,q.qid,q.title,top.name AS topic_name,'
            + '         z.title AS zone_title,z.number AS zone_number,'
            + '         (lag(z.id) OVER (PARTITION BY z.id ORDER BY tq.number) IS NULL) AS start_new_zone'
            + '     FROM test_questions AS tq'
            + '     JOIN questions AS q ON (q.id = tq.question_id)'
            + '     JOIN zones AS z ON (z.id = tq.zone_id)'
            + '     JOIN topics AS top ON (top.id = q.topic_id)'
            + '     WHERE z.test_id = :testId'
            + '     AND tq.deleted_at IS NULL'
            + '     AND q.deleted_at IS NULL'
            + '     ORDER BY (z.number, z.id, tq.number)'
            + ' ),'
            + ' course_tests AS ('
            + '     SELECT t.id,t.tid,t.type,t.number,t.title,ts.id AS test_set_id,ts.color,'
            + '         ts.short_name AS test_set_short_name,ts.long_name AS test_set_long_name'
            + '     FROM tests AS t'
            + '     JOIN test_sets AS ts ON (t.test_set_id = ts.id)'
            + '     WHERE ts.course_instance_id = :courseInstanceId'
            + '     AND t.deleted_at IS NULL'
            + ' ),'
            + ' test_lists AS ('
            + '     SELECT tql.id,'
            + '         JSONB_AGG(JSONB_BUILD_OBJECT('
            + '                 \'label\',t.test_set_short_name || t.number,'
            + '                 \'test_id\',t.id,'
            + '                 \'color\',t.color)'
            + '               ORDER BY (t.test_set_long_name, t.test_set_id, t.number))'
            + '           FILTER ('
            + '               WHERE t.test_set_id IS NOT NULL'
            + '               AND t.id != :testId'
            + '           )'
            + '           AS tests'
            + '     FROM test_questions_list AS tql'
            + '     LEFT JOIN ('
            + '         test_questions AS tq'
            + '         JOIN course_tests as t ON (t.id = tq.test_id)'
            + '     ) ON (tq.question_id = tql.question_id)'
            + '     WHERE tq.deleted_at IS NULL'
            + '     GROUP BY tql.id,tql.question_id'
            + ' )'
            + ' SELECT tql.*,tl.tests'
            + ' FROM test_questions_list AS tql'
            + ' LEFT JOIN test_lists AS tl ON (tql.id = tl.id)'
            + ' ORDER BY (tql.zone_number, tql.zone_id, tql.number)'
            + ' ;';
        var params = {
            testId: req.locals.testId,
            courseInstanceId: req.locals.courseInstanceId,
        };
        t = Date.now();
        return models.sequelize.query(sql, {replacements: params});
    }).spread(function(questions, info) {
        locals = _.extend({
            questions: questions,
        }, locals);

        var sql = ' SELECT * FROM test_stats WHERE id = :testId'
        var params = {
            testId: req.locals.testId,
        };
        return models.sequelize.query(sql, {replacements: params});
    }).spread(function(testStats, info) {
        if (testStats.length !== 1) throw Error("could not get test_stats for test_id = " + req.locals.testId);
        locals = _.extend({
            testStat: testStats[0],
        }, locals);

        var sql
            = ' SELECT'
            + '     format_interval(tds.median) AS median,'
            + '     format_interval(tds.min) AS min,'
            + '     format_interval(tds.max) AS max,'
            + '     format_interval(tds.mean) AS mean,'
            + '     threshold_seconds,'
            + '     threshold_labels,'
            + '     hist'
            + ' FROM test_duration_stats AS tds'
            + ' WHERE id = :testId'
        var params = {
            testId: req.locals.testId,
        };
        return models.sequelize.query(sql, {replacements: params});
    }).spread(function(durationStats, info) {
        if (durationStats.length !== 1) throw Error("could not get duration_stats for test_id = " + req.locals.testId);
        locals = _.extend({
            durationStat: durationStats[0],
        }, locals);

        var sql
            = ' SELECT'
            + '     u.id,u.uid,u.name,e.role,uts.score_perc,'
            + '     format_interval(utd.duration) AS duration,'
            + '     EXTRACT(EPOCH FROM utd.duration) AS duration_secs'
            + ' FROM tests AS t'
            + ' CROSS JOIN users AS u'
            + ' JOIN enrollments AS e ON (e.user_id = u.id)'
            + ' JOIN user_test_scores AS uts ON (uts.user_id = u.id AND uts.test_id = t.id)'
            + ' JOIN user_test_durations AS utd ON (utd.user_id = u.id AND utd.test_id = t.id)'
            + ' WHERE t.id = $testId'
            + ' AND t.course_instance_id = e.course_instance_id'
            + ' ORDER BY e.role DESC,u.uid,u.id'
            + ' ;';
        var params = {
            testId: req.locals.testId,
        };
        return models.sequelize.query(sql, {bind: params});
    }).spread(function(userScores, info) {
        locals = _.extend({
            userScores: userScores,
        }, locals);
        
        res.render('pages/testView', locals);
    });
});

router.get('/:filename', function(req, res, next) {
    if (req.params.filename == scoreStatsCsvFilename(req.locals)) {
        Promise.try(function() {
            var sql = 'SELECT * FROM test_stats WHERE id = :testId;';
            var params = {
                testId: req.locals.testId,
            };
            return models.sequelize.query(sql, {replacements: params});
        }).spread(function(testStats, info) {
            if (testStats.length !== 1) throw Error("could not get test_stats for test_id = " + req.locals.testId);
            var testStat = testStats[0];
            var csvHeaders = ['Course', 'Semester', 'Set', 'Number', 'Test', 'Title', 'TID', 'NStudents', 'Mean',
                              'Std', 'Min', 'Max', 'Median', 'NZero', 'NHundred', 'NZeroPerc', 'NHundredPerc'];
            var csvData = [
                req.locals.course.short_name,
                req.locals.semester.short_name,
                req.locals.testSet.long_name,
                req.locals.test.number,
                req.locals.testSet.short_name + req.locals.test.number,
                req.locals.test.title,
                req.locals.test.tid,
                testStat.number,
                testStat.mean,
                testStat.std,
                testStat.min,
                testStat.max,
                testStat.median,
                testStat.n_zero,
                testStat.n_hundred,
                testStat.n_zero_perc,
                testStat.n_hundred_perc,
            ];
            _(testStat.score_hist).each(function(score, i) {
                csvHeaders.push("Hist" + (i + 1));
                csvData.push(score);
            });
            csvData = [csvHeaders, csvData];
            csvStringify(csvData, function(err, csv) {
                if (err) throw Error("Error formatting CSV", err);
                res.attachment(req.params.filename);
                res.send(csv);
            });
        });
    } else {
        throw Error("Unknown filename: " + req.params.filename);
    }
});

module.exports = router;
