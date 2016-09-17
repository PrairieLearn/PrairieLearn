var ERR = require('async-stacktrace');
var _ = require('lodash');
var path = require('path');
var async = require('async');
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
        + locals.course_instance.short_name
        + '_'
        + locals.assessment_set.abbrev
        + locals.assessment.number
        + '_'
        + locals.instance_user.uid.replace(/[^a-z0-9]/g, '_')
        + '_'
        + locals.assessment_instance.number
        + '_'
        + 'log.csv';
};

router.get('/:assessmentInstanceId', function(req, res, next) {
    async.series([
        function(callback) {
            var params = {
                assessment_instance_id: req.params.assessmentInstanceId,
                auth_data: res.locals.auth_data,
            };
            sqldb.queryOneRow(sql.select_and_auth, params, function(err, result) {
                if (ERR(err, callback)) return;
                _.assign(res.locals, result.rows[0]);
                callback(null);
            });
        },
        function(callback) {
            res.locals.logCsvFilename = logCsvFilename(res.locals);
            callback(null);
        },
        function(callback) {
            var params = {assessment_instance_id: res.locals.assessment_instance.id};
            sqldb.query(sql.select_log, params, function(err, result) {
                if (ERR(err, callback)) return;
                res.locals.log = result.rows;
                callback(null);
            });
        },
    ], function(err) {
        if (ERR(err, next)) return;
        res.render(path.join(__dirname, 'adminAssessmentInstance'), res.locals);
    });
});

router.get('/:assessmentInstanceId/:filename', function(req, res, next) {
    var params = {
        assessment_instance_id: req.params.assessmentInstanceId,
        auth_data: res.locals.auth_data,
    };
    sqldb.queryOneRow(sql.select_and_auth, params, function(err, result) {
        if (ERR(err, next)) return;
        _.assign(res.locals, result.rows[0]);

        if (req.params.filename == logCsvFilename(res.locals)) {
            var params = {assessment_instance_id: res.locals.assessment_instance.id};
            sqldb.query(sql.select_log, params, function(err, result) {
                if (ERR(err, next)) return;
                var log = result.rows;
                var csvHeaders = ['Time', 'Event', 'Question', 'Data'];
                var csvData = _.map(log, function(row) {
                    return [
                        row.date,
                        row.event_name,
                        row.qid,
                        ((row.data != null) ? JSON.stringify(row.data) : null),
                    ];
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
});

module.exports = router;
