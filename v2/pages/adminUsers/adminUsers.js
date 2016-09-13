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

var csvFilename = function(locals) {
    return locals.course.short_name.replace(/\s+/g, '')
        + '_'
        + locals.courseInstance.short_name
        + '_'
        + 'user_scores.csv';
};

router.get('/', function(req, res, next) {
    res.locals.csvFilename = csvFilename(res.locals);
    var params = {course_instance_id: res.locals.courseInstanceId};
    sqldb.query(sql.course_assessments, params, function(err, result) {
        if (ERR(err, next)) return;
        res.locals.course_assessments = result.rows;

        var params = {course_instance_id: res.locals.courseInstanceId};
        sqldb.query(sql.user_scores, params, function(err, result) {
            if (ERR(err, next)) return;

            res.locals.user_scores = result.rows;
            res.render('pages/adminUsers/adminUsers', res.locals);
        });
    });
});

router.get('/:filename', function(req, res, next) {
    if (req.params.filename == csvFilename(res.locals)) {
        var params = {course_instance_id: res.locals.courseInstanceId};
        sqldb.query(sql.course_assessments, params, function(err, result) {
            if (ERR(err, next)) return;
            var courseAssessments = result.rows;
            sqldb.query(sql.user_scores, params, function(err, result) {
                if (ERR(err, next)) return;
                var userScores = result.rows;

                var csvHeaders = ['UID', 'Name', 'Role'].concat(_.map(courseAssessments, 'label'));
                var csvData = _.map(userScores, function(row) {
                    return [row.uid, row.user_name, row.role].concat(row.scores);
                });
                csvData.splice(0, 0, csvHeaders);
                csvStringify(csvData, function(err, csv) {
                    if (ERR(err, next)) return;
                    res.attachment(req.params.filename);
                    res.send(csv);
                });
            });
        });
    } else {
        next(new Error("Unknown filename: " + req.params.filename));
    }
});

module.exports = router;
