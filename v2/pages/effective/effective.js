var ERR = require('async-stacktrace');
var _ = require('lodash');
var path = require('path');
var express = require('express');
var router = express.Router();

var error = require('../../lib/error');
var logger = require('../../lib/logger');
var sqldb = require('../../lib/sqldb');
var sqlLoader = require('../../lib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/', function(req, res, next) {
    if (!res.locals.authn_authz_admin) return next();
    var params = {
        authn_user_id: res.locals.authn_user.id,
        course_instance_id: res.locals.course_instance.id,
        authn_role: res.locals.authn_enrollment.role,
    };
    sqldb.query(sql.select, params, function(err, result) {
        if (ERR(err, next)) return;
        _.assign(res.locals, result.rows[0]);

        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    });
});

router.post('/', function(req, res, next) {
    if (!res.locals.authn_authz_admin) return next();
    if (req.body.postAction == 'enroll') {
        var params = {
            course_instance_id: req.body.course_instance_id,
            authn_user_id: res.locals.authn_user.id,
        };
        sqldb.queryOneRow(sql.enroll, params, function(err, result) {
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
        });
    } else if (req.body.postAction == 'unenroll') {
        var params = {
            course_instance_id: req.body.course_instance_id,
            user_id: res.locals.authn_user.id,
        };
        sqldb.queryOneRow(sql.unenroll, params, function(err, result) {
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
        });
    } else {
        return next(error.make(400, 'unknown action: ' + res.locals.postAction, {postAction: req.body.postAction, body: req.body}));
    }
});

module.exports = router;
