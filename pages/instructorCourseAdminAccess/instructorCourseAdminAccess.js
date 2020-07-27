const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();

const error = require('@prairielearn/prairielib/error');
const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');

const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));

const sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/', (req, res, next) => {
    if (!res.locals.authz_data.has_course_permission_own) return next(new Error('Access denied (must be course owner)'));
    
    sqldb.query(sql.select_course_users, {course_id: res.locals.course.id}, (err, result) => {
        if (ERR(err, next)) return;
        res.locals.course_users = result.rows;
        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    });
});

router.post('/', (req, res, next) => {
    if (!res.locals.authz_data.has_course_permission_own) return next(new Error('Access denied (must be course owner)'));

    if (req.body.__action == 'course_permissions_insert_by_user_uid') {
        const params = [
            res.locals.course.id,
            req.body.uid,
            'None',
            res.locals.authz_data.authn_user.user_id,
        ];
        sqldb.call('course_permissions_insert_by_user_uid', params, (err, _result) => {
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
        });
    } else if (req.body.__action == 'course_permissions_update_role') {
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

        const params = [
            res.locals.course.id,
            req.body.user_id,
            req.body.course_role,
            res.locals.authz_data.authn_user.user_id,
        ];
        sqldb.call('course_permissions_update_role', params, (err, _result) => {
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
        });
    } else if (req.body.__action == 'course_permissions_delete') {
        const params = [
            res.locals.course.id,
            req.body.user_id,
            res.locals.authz_data.authn_user.user_id,
        ];
        sqldb.call('course_permissions_delete', params, (err, _result) => {
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
        });
    } else if (req.body.__action == 'course_instance_permissions_update_role_or_delete') {
        // FIXME: check authz
        // - check if user_id is owner (owners have full access to all)

        // Again, we could make some effort to verify that the user is still a
        // member of the course staff and that they still have student data access
        // in the given course instance. We choose not to do this for the same
        // reason as above (see handler for change_course_content_access).

        if (req.body.course_instance_role) {
            // In this case, we update the role associated with the course instance permission
            const params = [
                res.locals.course.id,
                req.body.user_id,
                req.body.course_instance_id,
                req.body.course_instance_role,
                res.locals.authz_data.authn_user.user_id,
            ];
            sqldb.call('course_instance_permissions_update_role', params, (err, _result) => {
                if (ERR(err, next)) return;
                res.redirect(req.originalUrl);
            });
        } else {
            // In this case, we delete the course instance permission
            const params = [
                res.locals.course.id,
                req.body.user_id,
                req.body.course_instance_id,
                res.locals.authz_data.authn_user.user_id,
            ];
            sqldb.call('course_instance_permissions_delete', params, (err, _result) => {
                if (ERR(err, next)) return;
                res.redirect(req.originalUrl);
            });
        }
    } else if (req.body.__action == 'course_instance_permissions_insert') {
        // FIXME: check authz
        // - check if user_id is owner (owners have full access to all)

        // Again, we could make some effort to verify that the user is still a
        // member of the course staff. We choose not to do this for the same
        // reason as above (see handler for change_course_content_access).

        const params = [
            res.locals.course.id,
            req.body.user_id,
            req.body.course_instance_id,
            'Student Data Viewer',
            res.locals.authz_data.authn_user.user_id,
        ];
        sqldb.call('course_instance_permissions_insert', params, (err, _result) => {
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
        });
    } else {
        return next(error.make(400, 'unknown __action', {locals: res.locals, body: req.body}));
    }
});

module.exports = router;
