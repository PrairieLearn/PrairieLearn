var ERR = require('async-stacktrace');
var _ = require('lodash');
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
    res.locals.scoreStatsCsvFilename = scoreStatsCsvFilename(res.locals);
    res.locals.durationStatsCsvFilename = durationStatsCsvFilename(res.locals);
    res.locals.scoresCsvFilename = scoresCsvFilename(res.locals);
    var params = {test_id: res.locals.testId};
    sqldb.query(sql.questions, params, function(err, result) {
        if (ERR(err, next)) return;
        res.locals.questions = result.rows;

        var params = {test_id: res.locals.testId};
        sqldb.queryOneRow(sql.test_stats, params, function(err, result) {
            if (ERR(err, next)) return;
            res.locals.testStat = result.rows[0];

            // FIXME: change to test_instance_duration_stats and show all instances
            var params = {test_id: res.locals.testId};
            sqldb.queryOneRow(sql.test_duration_stats, params, function(err, result) {
                if (ERR(err, next)) return;
                res.locals.durationStat = result.rows[0];

                // FIXME: change to test_instance_scores and show all instances
                var params = {test_id: res.locals.testId};
                sqldb.query(sql.user_test_scores, params, function(err, result) {
                    if (ERR(err, next)) return;
                    res.locals.userScores = result.rows;
                    
                    res.render(path.join(__dirname, 'adminTest'), res.locals);
                });
            });
        });
    });
});

router.get('/:filename', function(req, res, next) {
    if (req.params.filename == scoreStatsCsvFilename(res.locals)) {
        var params = {test_id: res.locals.testId};
        sqldb.queryOneRow(sql.test_stats, params, function(err, result) {
            if (ERR(err, next)) return;
            var testStat = result.row[0];
            var csvHeaders = ['Course', 'Instance', 'Set', 'Number', 'Test', 'Title', 'TID', 'NStudents', 'Mean',
                              'Std', 'Min', 'Max', 'Median', 'NZero', 'NHundred', 'NZeroPerc', 'NHundredPerc'];
            var csvData = [
                res.locals.course.short_name,
                res.locals.courseInstance.short_name,
                res.locals.testSet.name,
                res.locals.test.number,
                res.locals.testSet.abbrev + res.locals.test.number,
                res.locals.test.title,
                res.locals.test.tid,
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
