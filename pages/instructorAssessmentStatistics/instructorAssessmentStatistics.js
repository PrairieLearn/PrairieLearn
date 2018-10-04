const ERR = require('async-stacktrace');
const _ = require('lodash');
const async = require('async');
const express = require('express');
const router = express.Router();
const csvStringify = require('csv').stringify;
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));

const assessment = require('../../lib/assessment');
const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');

const sql = sqlLoader.loadSqlEquiv(__filename);

const setFilenames = function(locals) {
    const prefix = assessment.filenamePrefix(locals.assessment, locals.assessment_set, locals.course_instance, locals.course);
    locals.scoreStatsCsvFilename = prefix + 'score_stats.csv';
    locals.durationStatsCsvFilename = prefix + 'duration_stats.csv';
    locals.statsByDateCsvFilename = prefix + 'scores_by_date.csv';
};

router.get('/', function(req, res, next) {
    debug('GET /');
    setFilenames(res.locals);
    async.series([
        function(callback) {
            debug('query assessment_stats');
            var params = {assessment_id: res.locals.assessment.id};
            sqldb.queryOneRow(sql.assessment_stats, params, function(err, result) {
                if (ERR(err, callback)) return;
                res.locals.assessment_stat = result.rows[0];
                callback(null);
           });
        },
        function(callback) {
            debug('query assessment_duration_stats');
            // FIXME: change to assessment_instance_duration_stats and show all instances
            var params = {assessment_id: res.locals.assessment.id};
            sqldb.queryOneRow(sql.assessment_duration_stats, params, function(err, result) {
                if (ERR(err, callback)) return;
                res.locals.duration_stat = result.rows[0];
                callback(null);
            });
        },
        function(callback) {
            debug('query assessment_score_histogram_by_date');
            var params = {assessment_id: res.locals.assessment.id};
            sqldb.query(sql.assessment_score_histogram_by_date, params, function(err, result) {
                if (ERR(err, next)) return;
                res.locals.assessment_score_histogram_by_date = result.rows;
                callback(null);
            });
        },
        function(callback) {
            debug('query user_scores');
            var params = {assessment_id: res.locals.assessment.id};
            sqldb.query(sql.user_scores, params, function(err, result) {
                if (ERR(err, callback)) return;
                res.locals.user_scores = result.rows;
                callback(null);
            });
        },
    ], function(err) {
        if (ERR(err, next)) return;
        debug('render page');
        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    });
});

router.get('/:filename', function(req, res, next) {
    setFilenames(res.locals);
    if (req.params.filename == res.locals.scoreStatsCsvFilename) {
        let params = {assessment_id: res.locals.assessment.id};
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
                res.locals.assessment_set.abbreviation + res.locals.assessment.number,
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
                csvHeaders.push('Hist ' + (i + 1));
                csvData.push(count);
            });
            csvData = [csvHeaders, csvData];
            csvStringify(csvData, function(err, csv) {
                if (ERR(err, next)) return;
                res.attachment(req.params.filename);
                res.send(csv);
            });
        });
    } else if (req.params.filename == res.locals.durationStatsCsvFilename) {
        let params = {assessment_id: res.locals.assessment.id};
        sqldb.queryOneRow(sql.assessment_duration_stats, params, function(err, result) {
            if (ERR(err, next)) return;
            var durationStat = result.rows[0];
            var csvHeaders = ['Course', 'Instance', 'Set', 'Number', 'Assessment', 'Title', 'TID',
                              'Mean duration (min)', 'Median duration (min)', 'Min duration (min)', 'Max duration (min)'];
            var csvData = [
                res.locals.course.short_name,
                res.locals.course_instance.short_name,
                res.locals.assessment_set.name,
                res.locals.assessment.number,
                res.locals.assessment_set.abbreviation + res.locals.assessment.number,
                res.locals.assessment.title,
                res.locals.assessment.tid,
                durationStat.mean_mins,
                durationStat.median_mins,
                durationStat.min_mins,
                durationStat.max_mins,
            ];
            _(durationStat.threshold_seconds).each(function(count, i) {
                csvHeaders.push('Hist boundary ' + (i + 1) + ' (s)');
                csvData.push(count);
            });
            _(durationStat.hist).each(function(count, i) {
                csvHeaders.push('Hist' + (i + 1));
                csvData.push(count);
            });
            csvData = [csvHeaders, csvData];
            csvStringify(csvData, function(err, csv) {
                if (ERR(err, next)) return;
                res.attachment(req.params.filename);
                res.send(csv);
            });
        });
    } else if (req.params.filename == res.locals.statsByDateCsvFilename) {
        let params = {assessment_id: res.locals.assessment.id};
        sqldb.query(sql.assessment_score_histogram_by_date, params, function(err, result) {
            if (ERR(err, next)) return;
            var scoresByDay = result.rows;

            var csvHeaders = ['Date'];
            _(scoresByDay).each(function(day) {
                csvHeaders.push(day.date_formatted);
            });

            var numDays = scoresByDay.length;
            var numGroups = scoresByDay[0].histogram.length;

            var csvData = [];

            let groupData = ['Number'];
            for (let day = 0; day < numDays; day++) {
                groupData.push(scoresByDay[day].number);
            }
            csvData.push(groupData);

            groupData = ['Mean score perc'];
            for (let day = 0; day < numDays; day++) {
                groupData.push(scoresByDay[day].mean_score_perc);
            }
            csvData.push(groupData);

            for (var group = 0; group < numGroups; group++) {
                groupData = [(group * 10) + '% to ' + ((group + 1) * 10) + '%'];
                for (var day = 0; day < numDays; day++) {
                    groupData.push(scoresByDay[day].histogram[group]);
                }
                csvData.push(groupData);
            }
            csvData.splice(0, 0, csvHeaders);
            csvStringify(csvData, function(err, csv) {
                if (ERR(err, next)) return;
                res.attachment(req.params.filename);
                res.send(csv);
            });
        });
    } else {
        next(new Error('Unknown filename: ' + req.params.filename));
    }
});

module.exports = router;
