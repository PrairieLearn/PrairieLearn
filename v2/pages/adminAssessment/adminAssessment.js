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
            var assessmentStat = result.row[0];
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
            _(assessmentStat.score_hist).each(function(score, i) {
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
