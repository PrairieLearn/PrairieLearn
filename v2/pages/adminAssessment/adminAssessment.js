var ERR = require('async-stacktrace');
var _ = require('lodash');
var path = require('path');
var csvStringify = require('csv').stringify;
var express = require('express');
var router = express.Router();

var logger = require('../../logger');
var sqldb = require('../../sqldb');
var sqlLoader = require('../../sql-loader');

var sql = sqlLoader.load(path.join(__dirname, 'adminAssessment.sql'));

var scoreStatsCsvFilename = function(locals) {
    return locals.course.short_name.replace(/\s+/g, '')
        + '_'
        + locals.courseInstance.short_name
        + '_'
        + locals.assessmentSet.abbrev
        + locals.assessment.number
        + '_'
        + 'score_stats.csv';
};

var durationStatsCsvFilename = function(locals) {
    return locals.course.short_name.replace(/\s+/g, '')
        + '_'
        + locals.courseInstance.short_name
        + '_'
        + locals.assessmentSet.abbrev
        + locals.assessment.number
        + '_'
        + 'duration_stats.csv';
};

var scoresCsvFilename = function(locals) {
    return locals.course.short_name.replace(/\s+/g, '')
        + '_'
        + locals.courseInstance.short_name
        + '_'
        + locals.assessmentSet.abbrev
        + locals.assessment.number
        + '_'
        + 'scores.csv';
};

router.get('/', function(req, res, next) {
    res.locals.scoreStatsCsvFilename = scoreStatsCsvFilename(res.locals);
    res.locals.durationStatsCsvFilename = durationStatsCsvFilename(res.locals);
    res.locals.scoresCsvFilename = scoresCsvFilename(res.locals);
    var params = {assessment_id: res.locals.assessmentId};
    sqldb.query(sql.questions, params, function(err, result) {
        if (ERR(err, next)) return;
        res.locals.questions = result.rows;

        var params = {assessment_id: res.locals.assessmentId};
        sqldb.queryOneRow(sql.assessment_stats, params, function(err, result) {
            if (ERR(err, next)) return;
            res.locals.assessmentStat = result.rows[0];

            // FIXME: change to assessment_instance_duration_stats and show all instances
            var params = {assessment_id: res.locals.assessmentId};
            sqldb.queryOneRow(sql.assessment_duration_stats, params, function(err, result) {
                if (ERR(err, next)) return;
                res.locals.durationStat = result.rows[0];

                // FIXME: change to assessment_instance_scores and show all instances
                var params = {assessment_id: res.locals.assessmentId};
                sqldb.query(sql.user_assessment_scores, params, function(err, result) {
                    if (ERR(err, next)) return;
                    res.locals.userScores = result.rows;
                    
                    res.render(path.join(__dirname, 'adminAssessment'), res.locals);
                });
            });
        });
    });
});

router.get('/:filename', function(req, res, next) {
    if (req.params.filename == scoreStatsCsvFilename(res.locals)) {
        var params = {assessment_id: res.locals.assessmentId};
        sqldb.queryOneRow(sql.assessment_stats, params, function(err, result) {
            if (ERR(err, next)) return;
            var assessmentStat = result.rows[0];
            var csvHeaders = ['Course', 'Instance', 'Set', 'Number', 'Assessment', 'Title', 'TID', 'NStudents', 'Mean',
                              'Std', 'Min', 'Max', 'Median', 'NZero', 'NHundred', 'NZeroPerc', 'NHundredPerc'];
            var csvData = [
                res.locals.course.short_name,
                res.locals.courseInstance.short_name,
                res.locals.assessmentSet.name,
                res.locals.assessment.number,
                res.locals.assessmentSet.abbrev + res.locals.assessment.number,
                res.locals.assessment.title,
                res.locals.assessment.tid,
                assessmentStat.number,
                assessmentStat.mean,
                assessmentStat.std,
                assessmentStat.min,
                assessmentStat.max,
                assessmentStat.median,
                assessmentStat.n_zero,
                assessmentStat.n_hundred,
                assessmentStat.n_zero_perc,
                assessmentStat.n_hundred_perc,
            ];
            _(assessmentStat.score_hist).each(function(count, i) {
                csvHeaders.push("Hist " + (i + 1));
                csvData.push(count);
            });
            csvData = [csvHeaders, csvData];
            csvStringify(csvData, function(err, csv) {
                if (err) throw Error("Error formatting CSV", err);
                res.attachment(req.params.filename);
                res.send(csv);
            });
        });
    } else if (req.params.filename == durationStatsCsvFilename(res.locals)) {
        var params = {assessment_id: res.locals.assessmentId};
        sqldb.queryOneRow(sql.assessment_duration_stats, params, function(err, result) {
            if (ERR(err, next)) return;
            var durationStat = result.rows[0];
            var csvHeaders = ['Course', 'Instance', 'Set', 'Number', 'Assessment', 'Title', 'TID',
                              'Median duration (min)', 'Min duration (min)', 'Max duration (min)', 'Mean duration (min)'];
            var csvData = [
                res.locals.course.short_name,
                res.locals.courseInstance.short_name,
                res.locals.assessmentSet.name,
                res.locals.assessment.number,
                res.locals.assessmentSet.abbrev + res.locals.assessment.number,
                res.locals.assessment.title,
                res.locals.assessment.tid,
                durationStat.median_mins,
                durationStat.min_mins,
                durationStat.max_mins,
                durationStat.mean_mins,
            ];
            _(durationStat.threshold_seconds).each(function(count, i) {
                csvHeaders.push("Hist boundary " + (i + 1) + " (s)");
                csvData.push(count);
            });
            _(durationStat.hist).each(function(count, i) {
                csvHeaders.push("Hist" + (i + 1));
                csvData.push(count);
            });
            csvData = [csvHeaders, csvData];
            csvStringify(csvData, function(err, csv) {
                if (err) throw Error("Error formatting CSV", err);
                res.attachment(req.params.filename);
                res.send(csv);
            });
        });
    } else if (req.params.filename == scoresCsvFilename(res.locals)) {
        var params = {assessment_id: res.locals.assessmentId};
        sqldb.query(sql.user_assessment_scores, params, function(err, result) {
            if (ERR(err, next)) return;
            var userScores = result.rows;
            var csvHeaders = ['UID', 'Name', 'Role', 'Score (%)', 'Duration (min)'];
            var csvData = [];
            _(userScores).each(function(row) {
                csvData.push([
                    row.uid,
                    row.name,
                    row.role,
                    row.score_perc,
                    row.duration_mins,
                ]);
            });
            csvData.splice(0, 0, csvHeaders);
            csvStringify(csvData, function(err, csv) {
                if (err) throw Error("Error formatting CSV", err);
                res.attachment(req.params.filename);
                res.send(csv);
            });
        });
    } else {
        next(new Error("Unknown filename: " + req.params.filename));
    }
});

module.exports = router;
