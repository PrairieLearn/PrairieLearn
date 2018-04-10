var ERR = require('async-stacktrace');
var _ = require('lodash');
var express = require('express');
var router = express.Router();

var error = require('../../lib/error');
var sqldb = require('../../lib/sqldb');
var sqlLoader = require('../../lib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/', function(req, res, next) {
    var params = {course_instance_id: res.locals.course_instance.id};
    sqldb.query(sql.course_assessments, params, function(err, result) {
        if (ERR(err, next)) return;
        res.locals.course_assessments = result.rows;

        var params = {course_instance_id: res.locals.course_instance.id,user_id: res.locals.user.user_id} ;
        sqldb.query(sql.user_scores, params, function(err, result) {
            if (ERR(err, next)) return;

            res.locals.user_scores = result.rows;
            res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
        });
    });
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
