var ERR = require('async-stacktrace');
var _ = require('lodash');
var path = require('path');
var csvStringify = require('csv').stringify;
var express = require('express');
var router = express.Router();

var logger = require('../../logger');
var sqldb = require('../../sqldb');
var sqlLoader = require('../../sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

var logCsvFilename = function(locals) {
    return locals.course.short_name.replace(/\s+/g, '')
        + '_'
        + locals.courseInstance.short_name
        + '_'
        + locals.assessmentSet.abbrev
        + locals.assessment.number
        + '_'
        // FIXME: add user UID here
        + locals.assessmentInstance.number
        + 'log.csv';
};

router.get('/', function(req, res, next) {
    res.locals.logCsvFilename = logCsvFilename(res.locals);
    var params = {assessment_instance_id: res.locals.assessmentInstance.id};
    sqldb.query(sql.log, params, function(err, result) {
        if (ERR(err, next)) return;
        res.locals.log = result.rows;

        res.render(path.join(__dirname, 'adminAssessmentInstance'), res.locals);
    });
});

router.get('/:filename', function(req, res, next) {
    if (req.params.filename == logCsvFilename(res.locals)) {
        var params = {assessment_instance_id: res.locals.assessmentInstanceId};
        sqldb.queryOneRow(sql.log, params, function(err, result) {
            if (ERR(err, next)) return;
            var log = result.rows[0];



            // FIXME: this is all old
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
    } else {
        next(new Error("Unknown filename: " + req.params.filename));
    }
});

module.exports = router;
