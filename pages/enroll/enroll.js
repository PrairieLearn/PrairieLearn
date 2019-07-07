var ERR = require('async-stacktrace');
var express = require('express');
var router = express.Router();

var error = require('@prairielearn/prairielib/error');
var sqldb = require('@prairielearn/prairielib/sql-db');
var sqlLoader = require('@prairielearn/prairielib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/', function(req, res, next) {
    if (res.locals.authn_user.provider == 'lti') {
        return next(error.make(400, 'Enrollment unavailable, managed via LTI'));
    }
    var params = {
        user_id: res.locals.authn_user.user_id,
        req_date: res.locals.req_date,
    };
    sqldb.query(sql.select_course_instances, params, function(err, result) {
        if (ERR(err, next)) return;
        res.locals.course_instances = result.rows;
        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    });
});

router.post('/', function(req, res, next) {
    if (res.locals.authn_user.provider == 'lti') {
        return next(error.make(400, 'Enrollment unavailable, managed via LTI'));
    }
    if (req.body.__action == 'enroll') {
        var params = {
            course_instance_id: req.body.course_instance_id,
            user_id: res.locals.authn_user.user_id,
            req_date: res.locals.req_date,
        };
        sqldb.queryOneRow(sql.enroll, params, function(err, _result) {
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
        });
    } else if (req.body.__action == 'unenroll') {
        let params = {
            course_instance_id: req.body.course_instance_id,
            user_id: res.locals.authn_user.user_id,
            req_date: res.locals.req_date,
        };
        sqldb.queryOneRow(sql.unenroll, params, function(err, _result) {
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
        });
    } else {
        return next(error.make(400, 'unknown action: ' + res.locals.__action, {__action: req.body.__action, body: req.body}));
    }
});

module.exports = router;
