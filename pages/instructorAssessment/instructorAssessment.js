var ERR = require('async-stacktrace');
var _ = require('lodash');
var path = require('path');
var csvStringify = require('csv').stringify;
var express = require('express');
var router = express.Router();

var error = require('../../lib/error');
var logger = require('../../lib/logger');
var assessments = require('../../assessments');
var sqldb = require('../../lib/sqldb');
var sqlLoader = require('../../lib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

var scoreStatsCsvFilename = function(locals) {
    return locals.course.short_name.replace(/\s+/g, '')
        + '_'
        + locals.course_instance.short_name
        + '_'
        + locals.assessment_set.abbrev
        + locals.assessment.number
        + '_'
        + 'score_stats.csv';
};

var durationStatsCsvFilename = function(locals) {
    return locals.course.short_name.replace(/\s+/g, '')
        + '_'
        + locals.course_instance.short_name
        + '_'
        + locals.assessment_set.abbrev
        + locals.assessment.number
        + '_'
        + 'duration_stats.csv';
};

var scoresCsvFilename = function(locals) {
    return locals.course.short_name.replace(/\s+/g, '')
        + '_'
        + locals.course_instance.short_name
        + '_'
        + locals.assessment_set.abbrev
        + locals.assessment.number
        + '_'
        + 'scores.csv';
};

router.get('/', function(req, res, next) {
    res.locals.scoreStatsCsvFilename = scoreStatsCsvFilename(res.locals);
    res.locals.durationStatsCsvFilename = durationStatsCsvFilename(res.locals);
    res.locals.scoresCsvFilename = scoresCsvFilename(res.locals);

    var params = {assessment_id: res.locals.assessment.id};
    sqldb.query(sql.questions, params, function(err, result) {
        if (ERR(err, next)) return;
        res.locals.questions = result.rows;

        var params = {assessment_id: res.locals.assessment.id};
        sqldb.query(sql.question_stats, params, function(err, result) {
            if (ERR(err, next)) return;
            res.locals.question_stats = result.rows;

            sqldb.queryOneRow(sql.assessment_stats, params, function(err, result) {
                if (ERR(err, next)) return;
                res.locals.assessment_stat = result.rows[0];
                // FIXME: change to assessment_instance_duration_stats and show all instances
                var params = {assessment_id: res.locals.assessment.id};
                sqldb.queryOneRow(sql.assessment_duration_stats, params, function(err, result) {
                    if (ERR(err, next)) return;
                    res.locals.duration_stat = result.rows[0];
    
                    var params = {assessment_id: res.locals.assessment.id};
                    sqldb.query(sql.assessment_instance_scores, params, function(err, result) {
                        if (ERR(err, next)) return;
                        res.locals.user_scores = result.rows;
                    
                        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
                    });
                });
            });
        });
    });
});

router.get('/:filename', function(req, res, next) {
    if (req.params.filename == scoreStatsCsvFilename(res.locals)) {
        var params = {assessment_id: res.locals.assessment.id};
        sqldb.queryOneRow(sql.assessment_stats, params, function(err, result) {
            if (ERR(err, next)) return;
            var assessmentStat = result.rows[0];
            var csvHeaders = ['Course', 'Instance', 'Set', 'Number', 'Assessment', 'Title', 'TID', 'NStudents', 'Mean',
                              'Std', 'Min', 'Max', 'Median', 'NZero', 'NHundred', 'NZeroPerc', 'NHundredPerc'];
            var csvData = [
                res.locals.course.short_name,
                res.locals.course_instance.short_name,
                res.locals.assessment_set.name,
                res.locals.assessment.number,
                res.locals.assessment_set.abbrev + res.locals.assessment.number,
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
        var params = {assessment_id: res.locals.assessment.id};
        sqldb.queryOneRow(sql.assessment_duration_stats, params, function(err, result) {
            if (ERR(err, next)) return;
            var durationStat = result.rows[0];
            var csvHeaders = ['Course', 'Instance', 'Set', 'Number', 'Assessment', 'Title', 'TID',
                              'Median duration (min)', 'Min duration (min)', 'Max duration (min)', 'Mean duration (min)'];
            var csvData = [
                res.locals.course.short_name,
                res.locals.course_instance.short_name,
                res.locals.assessment_set.name,
                res.locals.assessment.number,
                res.locals.assessment_set.abbrev + res.locals.assessment.number,
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
        var params = {assessment_id: res.locals.assessment.id};
        sqldb.query(sql.assessment_instance_scores, params, function(err, result) {
            if (ERR(err, next)) return;
            var userScores = result.rows;
            var csvHeaders = ['UID', 'Name', 'Role', 'Instance', 'Score (%)', 'Duration (min)'];
            var csvData = [];
            _(userScores).each(function(row) {
                csvData.push([
                    row.uid,
                    row.name,
                    row.role,
                    row.number,
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

router.post('/', function(req, res, next) {
    if (!res.locals.authz_data.has_instructor_edit) return next();
    if (req.body.postAction == 'open') {
        var params = {
            assessment_id: res.locals.assessment.id,
            assessment_instance_id: req.body.assessment_instance_id,
            authn_user_id: res.locals.authz_data.authn_user.id,
        };
        sqldb.queryOneRow(sql.open, params, function(err, result) {
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
        });
    } else if (req.body.postAction == 'close') {
        var params = {
            assessment_id: res.locals.assessment.id,
            assessment_instance_id: req.body.assessment_instance_id,
            authz_data: res.locals.authz_data,
        };
        sqldb.queryOneRow(sql.select_finish_data, params, function(err, result) {
            if (ERR(err, next)) return;
            var credit = result.rows[0].credit;
            var finish = true;
            assessments.gradeAssessmentInstance(req.body.assessment_instance_id, res.locals.authn_user.id, credit, finish, function(err) {
                if (ERR(err, next)) return;
                res.redirect(req.originalUrl);
            });
        });
    } else {
        return next(error.make(400, 'unknown postAction', {locals: res.locals, body: req.body}));
    }
});

module.exports = router;
