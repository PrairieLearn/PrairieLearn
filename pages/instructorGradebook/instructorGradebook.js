var ERR = require('async-stacktrace');
var _ = require('lodash');
var csvStringify = require('csv').stringify;
var express = require('express');
var router = express.Router();

var error = require('@prairielearn/prairielib/error');
var sqldb = require('@prairielearn/prairielib/sql-db');
var sqlLoader = require('@prairielearn/prairielib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

var csvFilename = function(locals) {
    return locals.course.short_name.replace(/\s+/g, '')
        + '_'
        + locals.course_instance.short_name
        + '_'
        + 'gradebook.csv';
};

router.get('/', function(req, res, next) {
    res.locals.csvFilename = csvFilename(res.locals);
    var params = {course_instance_id: res.locals.course_instance.id};
    sqldb.query(sql.course_assessments, params, function(err, result) {
        if (ERR(err, next)) return;
        res.locals.course_assessments = result.rows;

        var params = {course_instance_id: res.locals.course_instance.id};
        sqldb.query(sql.user_scores, params, function(err, result) {
            if (ERR(err, next)) return;

            res.locals.user_scores = result.rows;
            res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
        });
    });
});

router.get('/:filename', function(req, res, next) {
    if (req.params.filename == csvFilename(res.locals)) {
        var params = {course_instance_id: res.locals.course_instance.id};
        sqldb.query(sql.course_assessments, params, function(err, result) {
            if (ERR(err, next)) return;
            var courseAssessments = result.rows;
            sqldb.query(sql.user_scores, params, function(err, result) {
                if (ERR(err, next)) return;
                var userScores = result.rows;

                var csvHeaders = ['UID', 'Name', 'Role'].concat(_.map(courseAssessments, 'label'));
                var csvData = _.map(userScores, function(row) {
                    const score_percs = _.map(row.scores, s => s.score_perc);
                    return [row.uid, row.user_name, row.role].concat(score_percs);
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
        next(new Error('Unknown filename: ' + req.params.filename));
    }
});

router.post('/', function(req, res, next) {
    if (!res.locals.authz_data.has_instructor_edit) return next();
    if (req.body.__action == 'edit_total_score_perc') {
        let params = [
            req.body.assessment_instance_id,
            req.body.score_perc,
            res.locals.authn_user.user_id,
        ];
        sqldb.call('assessment_instances_update_score_perc', params, function(err, _result) {
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
        });
    } else {
        return next(error.make(400, 'unknown __action', {locals: res.locals, body: req.body}));
    }
});

module.exports = router;
