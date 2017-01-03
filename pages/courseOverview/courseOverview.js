var ERR = require('async-stacktrace');
var _ = require('lodash');
var path = require('path');
var csvStringify = require('csv').stringify;
var express = require('express');
var router = express.Router();

var logger = require('../../lib/logger');
var sqldb = require('../../lib/sqldb');
var sqlLoader = require('../../lib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/', function(req, res, next) {
    var params = {
        course_id: res.locals.course.id,
        authz_data: res.locals.authz_data,
    };
    sqldb.queryOneRow(sql.select_course_info, params, function(err, result) {
        if (ERR(err, next)) return;

        _.assign(res.locals, result.rows[0]);
        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    });
});

router.post('/', function(req, res, next) {
    if (!res.locals.authz_data.has_course_permission_own) return next(new Error('Insufficient permissions'));
    if (req.body.postAction == 'addUser') {
        var params = [
            res.locals.course.id,
            req.body.uid,
            req.body.course_role,
            res.locals.authz_data.authn_user.id,
        ];
        sqldb.call('course_permissions_add_by_uid', params, function(err, result) {
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
        });
    } else if (req.body.postAction == 'changeRole') {
        var params = [
            res.locals.course.id,
            req.body.user_id,
            req.body.course_role,
            res.locals.authz_data.authn_user.id,
        ];
        sqldb.call('course_permissions_change_role', params, function(err, result) {
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
        });
    } else if (req.body.postAction == 'deleteUser') {
        var params = [
            res.locals.course.id,
            req.body.user_id,
            res.locals.authz_data.authn_user.id,
        ];
        sqldb.call('course_permissions_remove_user', params, function(err, result) {
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
        });
    } else {
        return next(error.make(400, 'unknown postAction', {locals: res.locals, body: req.body}));
    }
});

module.exports = router;
