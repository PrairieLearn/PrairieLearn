var ERR = require('async-stacktrace');
var express = require('express');
var router = express.Router();

const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));

var error = require('@prairielearn/prairielib/error');
var sqldb = require('@prairielearn/prairielib/sql-db');
var sqlLoader = require('@prairielearn/prairielib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

const async = require('async');

router.get('/', function(req, res, next) {
    sqldb.query(sql.select_course_users, {course_id: res.locals.course.id}, function(err, result) {
        if (ERR(err, next)) return;
        debug(result.rows);
        res.locals.course_users = result.rows;
        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    });
});

router.post('/', function(req, res, next) {
    if (!res.locals.authz_data.has_course_permission_own) return next(new Error('Insufficient permissions'));
    if (req.body.__action == 'course_permissions_insert_by_user_uid') {
        let params = [
            res.locals.course.id,
            req.body.uid,
            req.body.course_role,
            res.locals.authz_data.authn_user.user_id,
        ];
        sqldb.call('course_permissions_insert_by_user_uid', params, function(err, _result) {
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
        });
    } else if (req.body.__action == 'course_permissions_update_role') {
        let params = [
            res.locals.course.id,
            req.body.user_id,
            req.body.course_role,
            res.locals.authz_data.authn_user.user_id,
        ];
        sqldb.call('course_permissions_update_role', params, function(err, _result) {
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
        });
    } else if (req.body.__action == 'course_permissions_delete') {
        var params = [
            res.locals.course.id,
            req.body.user_id,
            res.locals.authz_data.authn_user.user_id,
        ];
        sqldb.call('course_permissions_delete', params, function(err, _result) {
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
        });
    } else if (req.body.__action == 'change_course_content_access') {
        // FIXME: check authz

        if (req.body.user_id == res.locals.user.user_id) {
            return next(new Error('Owners cannot change their own permissions'));
        }

        async.series([
            (callback) => {
                sqldb.query(sql.select_course_users, {course_id: res.locals.course.id}, function(err, result) {
                    if (ERR(err, callback)) return;
                    const course_users = result.rows;
                    if (course_users.every((course_user) => course_user.user_id != req.body.user_id)) {
                        return callback(new Error('Not a course user'));
                    }
                    callback(null);
                });
            },
            (callback) => {
                const params = {
                    user_id: req.body.user_id,
                    course_role: req.body.course_role,
                    course_id: res.locals.course.id,
                };
                sqldb.query(sql.update_course_permissions, params, (err, result) => {
                    if (ERR(err, callback)) return;
                    callback(null)
                });
            }
        ], (err) => {
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
        });
    } else {
        debug(req.body);
        return next(error.make(400, 'unknown __action', {locals: res.locals, body: req.body}));
    }
});

module.exports = router;
