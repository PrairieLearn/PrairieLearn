var _ = require('underscore');
var path = require('path');
var csvStringify = require('csv').stringify;
var express = require('express');
var router = express.Router();

var logger = require('../../logger');
var sqldb = require('../../sqldb');
var sqlLoader = require('../../sql-loader');

var sql = sqlLoader.load(path.join(__dirname, 'adminTest.sql'));

var scoreStatsCsvFilename = function(locals) {
    return locals.course.short_name.replace(/\s+/g, '')
        + '_'
        + locals.courseInstance.short_name
        + '_'
        + locals.testSet.short_name
        + locals.test.number
        + '_'
        + 'score_stats.csv';
};

var durationStatsCsvFilename = function(locals) {
    return locals.course.short_name.replace(/\s+/g, '')
        + '_'
        + locals.courseInstance.short_name
        + '_'
        + locals.testSet.short_name
        + locals.test.number
        + '_'
        + 'duration_stats.csv';
};

var scoresCsvFilename = function(locals) {
    return locals.course.short_name.replace(/\s+/g, '')
        + '_'
        + locals.courseInstance.short_name
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
    var params = [req.locals.testId, req.locals.courseInstanceId];
    sqldb.query(sql.questions, params, function(err, result) {
        if (err) {logger.error('adminTest questions query failed', err); return res.status(500).end();}
        locals = _.extend({
            questions: result.rows,
        }, locals);

        var params = [req.locals.testId];
        sqldb.query(sql.test_stats, params, function(err, result) {
            if (err) {logger.error('adminTest test_stats query failed', err); return res.status(500).end();}
            if (result.rowCount !== 1) {logger.error('adminTest no test_stats', err); return res.status(500).end();}
            locals = _.extend({
                testStat: result.rows[0],
            }, locals);

            var params = [req.locals.testId];
            sqldb.query(sql.test_duration_stats, params, function(err, result) {
                if (err) {logger.error('adminTest test_duration_stats query failed', err); return res.status(500).end();}
                if (result.rowCount !== 1) {logger.error('adminTest no test_duration_stats', err); return res.status(500).end();}
                locals = _.extend({
                    durationStat: result.rows[0],
                }, locals);

                var params = [req.locals.testId];
                sqldb.query(sql.user_test_scores, params, function(err, result) {
                    if (err) {logger.error('adminTest user_test_scores query failed', err); return res.status(500).end();}
                    locals = _.extend({
                        userScores: result.rows,
                    }, locals);
                    
                    res.render(path.join(__dirname, 'adminTest'), locals);
                });
            });
        });
    });
});

router.get('/:filename', function(req, res, next) {
    if (req.params.filename == scoreStatsCsvFilename(req.locals)) {
        var params = [req.locals.testId];
        sqldb.query(sql.test_stats, params, function(err, result) {
            if (err) {logger.error('adminTest test_stats csv query failed', err); return res.status(500).end();}
            if (result.rowCount !== 1) {logger.error('adminTest no test_stats for csv', err); return res.status(500).end();}
            var testStat = result.row[0];
            var csvHeaders = ['Course', 'Instance', 'Set', 'Number', 'Test', 'Title', 'TID', 'NStudents', 'Mean',
                              'Std', 'Min', 'Max', 'Median', 'NZero', 'NHundred', 'NZeroPerc', 'NHundredPerc'];
            var csvData = [
                req.locals.course.short_name,
                req.locals.courseInstance.short_name,
                req.locals.testSet.name,
                req.locals.test.number,
                req.locals.testSet.abbrev + req.locals.test.number,
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
