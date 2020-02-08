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
        result.rows.forEach((row) => {
            debug(row.other_course_instances);
        });
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
        // - remove all course instance access roles if user changed to owner?

        if (req.body.user_id == res.locals.user.user_id) {
            return next(new Error('Owners cannot change their own permissions'));
        }

        // Before proceeding, we *could* make some effort to verify that the user
        // is still a member of the course staff. The reason we might want to do so
        // is that sql.update_course_permissions will throw an "incorrect row count"
        // error if the user has been removed from the course staff, and we might
        // want to throw a more informative error beforehand.
        //
        // We are making the design choice *not* to do this verification, because
        // it is unlikely that a course will have many owners all making changes to
        // permissions simultaneously, and so we are choosing to prioritize speed
        // in responding to the POST request.

        async.series([
            (callback) => {
                const params = {
                    user_id: req.body.user_id,
                    course_id: res.locals.course.id,
                    course_role: req.body.course_role,
                };
                sqldb.queryOneRow(sql.update_course_permissions, params, (err, _result) => {
                    if (ERR(err, callback)) return;
                    callback(null)
                });
            }
        ], (err) => {
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
        });
    } else if (req.body.__action == 'change_student_data_access') {
        // FIXME: check authz
        // - check if user_id is owner (owners have full access to all)

        // Again, we could make some effort to verify that the user is still a
        // member of the course staff and that they still have student data access
        // in the given course instance. We choose not to do this for the same
        // reason as above (see handler for change_course_content_access).

        async.series([
            (callback) => {
                const params = {
                    user_id: req.body.user_id,
                    course_id: res.locals.course.id,
                    course_instance_id: req.body.course_instance_id,
                    course_instance_role: req.body.course_instance_role,
                };
                sqldb.queryOneRow(sql.update_course_instance_permissions, params, (err, _result) => {
                    if (ERR(err, callback)) return;
                    callback(null)
                });
            }
        ], (err) => {
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
        });
    } else if (req.body.__action == 'add_student_data_access') {
        // FIXME: check authz
        // - check if user_id is owner (owners have full access to all)

        // Again, we could make some effort to verify that the user is still a
        // member of the course staff. We choose not to do this for the same
        // reason as above (see handler for change_course_content_access).

        async.series([
            (callback) => {
                const params = {
                    user_id: req.body.user_id,
                    course_id: res.locals.course.id,
                    course_instance_id: req.body.course_instance_id,
                };
                sqldb.queryOneRow(sql.insert_course_instance_permissions, params, (err, _result) => {
                    if (ERR(err, callback)) return;
                    callback(null)
                });
            }
        ], (err) => {
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
        });
    } else if (req.body.__action == 'remove_student_data_access') {
        // FIXME: check authz
        // - check if user_id is owner (owners have full access to all)

        // Again, we could make some effort to verify that the user is still a
        // member of the course staff and that they still have student data access
        // in the given course instance. We choose not to do this for the same
        // reason as above (see handler for change_course_content_access).

        async.series([
            (callback) => {
                const params = {
                    user_id: req.body.user_id,
                    course_id: res.locals.course.id,
                    course_instance_id: req.body.course_instance_id,
                };
                sqldb.queryOneRow(sql.delete_course_instance_permissions, params, (err, _result) => {
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
