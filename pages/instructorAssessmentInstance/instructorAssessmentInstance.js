var ERR = require('async-stacktrace');
var _ = require('lodash');
var csvStringify = require('csv').stringify;
var express = require('express');
var router = express.Router();

var sqldb = require('../../lib/sqldb');
var sqlLoader = require('../../lib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

var logCsvFilename = function(locals) {
    return locals.course.short_name.replace(/\s+/g, '')
        + '_'
        + locals.course_instance.short_name
        + '_'
        + locals.assessment_set.abbreviation
        + locals.assessment.number
        + '_'
        + locals.instance_user.uid.replace(/[^a-z0-9]/g, '_')
        + '_'
        + locals.assessment_instance.number
        + '_'
        + 'log.csv';
};

router.get('/', function(req, res, next) {
    res.locals.logCsvFilename = logCsvFilename(res.locals);
    var params = {assessment_instance_id: res.locals.assessment_instance.id};
    sqldb.query(sql.assessment_instance_stats, params, function(err, result) {
        if (ERR(err, next)) return;
        res.locals.assessment_instance_stats = result.rows;
        sqldb.queryOneRow(sql.select_data, params, function (err, result) {
            if (ERR(err, next)) return;
            res.locals.assessment_instance_duration = result.rows[0].assessment_instance_duration;

            var params = {assessment_instance_id: res.locals.assessment_instance.id};
            sqldb.query(sql.select_log, params, function (err, result) {
                if (ERR(err, next)) return;
                res.locals.log = result.rows;

                res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
            });
        });
    });
});

router.get('/:filename', function(req, res, next) {
    if (req.params.filename == logCsvFilename(res.locals)) {
        var params = {assessment_instance_id: res.locals.assessment_instance.id};
        sqldb.query(sql.select_log, params, function(err, result) {
            if (ERR(err, next)) return;
            var log = result.rows;
            var csvHeaders = ['Time', 'Auth user', 'Event', 'Question', 'Variant', 'Data'];
            var csvData = _.map(log, function(row) {
                return [
                    row.date_iso8601,
                    row.auth_user_uid,
                    row.event_name,
                    row.qid,
                    row.variant_number,
                    ((row.data != null) ? JSON.stringify(row.data) : null),
                ];
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
