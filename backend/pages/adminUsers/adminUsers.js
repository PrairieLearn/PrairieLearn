var ERR = require('async-stacktrace');
var _ = require('lodash');
var path = require('path');
var csvStringify = require('csv').stringify;
var express = require('express');
var router = express.Router();

var logger = require('../../logger');
var sqldb = require('../../sqldb');
var sqlLoader = require('../../sql-loader');

var sql = sqlLoader.load(path.join(__dirname, 'adminUsers.sql'));

var csv_filename = function(locals) {
    return locals.course.short_name.replace(/\s+/g, '')
        + '_'
        + locals.courseInstance.short_name
        + '_'
        + 'user_scores.csv';
};

router.get('/', function(req, res, next) {
    res.locals.csv_filename = csv_filename(res.locals);
    var params = {course_instance_id: res.locals.courseInstanceId};
    sqldb.query(sql.course_tests, params, function(err, result) {
        if (ERR(err, next)) return;
        res.locals.course_tests = result.rows;

        var params = {course_instance_id: res.locals.courseInstanceId};
        sqldb.query(sql.user_scores, params, function(err, result) {
            if (ERR(err, next)) return;

            res.locals.user_scores = result.rows;
            res.render('pages/adminUsers/adminUsers', res.locals);
        });
    });
});

router.get('/:filename', function(req, res, next) {
    var params = {course_instance_id: res.locals.courseInstanceId};
    sqldb.query(sql.course_tests, params, function(err, result) {
        if (ERR(err, next)) return;
        var course_tests = result.rows;
        sqldb.query(sql.user_scores, params, function(err, result) {
            if (ERR(err, next)) return;
            var user_scores = result.rows;

            var csvHeaders = ['UID', 'Name', 'Role'].concat(_(course_tests).pluck('label'));
            var csvData = _(user_scores).map(function(row) {
                return [row.uid, row.user_name, row.role].concat(row.scores);
            });
            csvData.splice(0, 0, csvHeaders);
            csvStringify(csvData, function(err, csv) {
                if (err) throw Error("Error formatting CSV", err);
                res.attachment(req.params.filename);
                res.send(csv);
            });
        });
    });
});

module.exports = router;
