var ERR = require('async-stacktrace');
var _ = require('lodash');
var csvStringify = require('csv').stringify;
var express = require('express');
var router = express.Router();

var sqldb = require('@prairielearn/prairielib/sql-db');
var sqlLoader = require('@prairielearn/prairielib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

var csvFilename = function(locals) {
    return locals.course.short_name.replace(/\s+/g, '')
        + '_'
        + locals.course_instance.short_name.replace(/\s+/g, '')
        + '_'
        + 'assessment_stats.csv';
};

router.get('/', function(req, res, next) {
    res.locals.csvFilename = csvFilename(res.locals);
    var params = {
        course_instance_id: res.locals.course_instance.id,
        authz_data: res.locals.authz_data,
        req_date: res.locals.req_date,
    };
    sqldb.query(sql.select_assessments, params, function(err, result) {
        if (ERR(err, next)) return;

        res.locals.rows = result.rows;
        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    });
});

router.get('/:filename', function(req, res, next) {
    if (req.params.filename == csvFilename(res.locals)) {
        var params = {
            course_instance_id: res.locals.course_instance.id,
            authz_data: res.locals.authz_data,
            req_date: res.locals.req_date,
        };
        sqldb.query(sql.select_assessments, params, function(err, result) {
            if (ERR(err, next)) return;
            var assessmentStats = result.rows;
            var csvHeaders = ['Course', 'Instance', 'Set', 'Number', 'Assessment', 'Title', 'TID',
                              'NStudents', 'Mean', 'Std', 'Min', 'Max', 'Median',
                              'NZero', 'NHundred', 'NZeroPerc', 'NHundredPerc',
                              'Hist1', 'Hist2', 'Hist3', 'Hist4', 'Hist5',
                              'Hist6', 'Hist7', 'Hist8', 'Hist9', 'Hist10'];
            var csvData = [];
            _(assessmentStats).each(function(assessmentStat) {
                var csvRow = [
                    res.locals.course.short_name,
                    res.locals.course_instance.short_name,
                    assessmentStat.name,
                    assessmentStat.assessment_number,
                    assessmentStat.label,
                    assessmentStat.title,
                    assessmentStat.tid,
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
                csvRow = csvRow.concat(assessmentStat.score_hist);
                csvData.push(csvRow);
            });
            csvData.splice(0, 0, csvHeaders);
            csvStringify(csvData, function(err, csv) {
                if (err) throw Error('Error formatting CSV', err);
                res.attachment(req.params.filename);
                res.send(csv);
            });
        });
    } else {
        next(new Error('Unknown filename: ' + req.params.filename));
    }
});

module.exports = router;
