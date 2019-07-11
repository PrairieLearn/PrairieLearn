var ERR = require('async-stacktrace');
var _ = require('lodash');

var logger = require('../lib/logger');
var config = require('../lib/config');
var error = require('@prairielearn/prairielib/error');
var sqldb = require('@prairielearn/prairielib/sql-db');
var sqlLoader = require('@prairielearn/prairielib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

module.exports = function(req, res, next) {
    var params = {
        authn_user_id: res.locals.authn_user.user_id,
        course_instance_id: req.params.course_instance_id,
        is_administrator: res.locals.is_administrator,
        req_date: res.locals.req_date,
        ip: req.headers['x-forwarded-for'] || req.ip,
        force_mode: (config.authType == 'none' && req.cookies.pl_requested_mode) ? req.cookies.pl_requested_mode : null,
    };
    sqldb.queryZeroOrOneRow(sql.select_authz_data, params, function(err, result) {
        if (ERR(err, next)) return;
        if (result.rowCount == 0) return next(error.make(403, 'Access denied'));

        var authn_mode = result.rows[0].mode;
        res.locals.course = result.rows[0].course;
        res.locals.course_instance = result.rows[0].course_instance;

        var permissions_course_instance = result.rows[0].permissions_course_instance;
        var permissions_course = result.rows[0].permissions_course;

        // effective user data defaults to auth user data
        res.locals.authz_data = {
            authn_user: _.cloneDeep(res.locals.authn_user),
            authn_role: permissions_course_instance.role,
            authn_mode: authn_mode,
            authn_has_instructor_view: permissions_course_instance.has_instructor_view,
            authn_has_instructor_edit: permissions_course_instance.has_instructor_edit,
            authn_course_role: permissions_course.course_role,
            authn_has_course_permission_view: permissions_course.has_course_permission_view,
            authn_has_course_permission_edit: permissions_course.has_course_permission_edit,
            authn_has_course_permission_own: permissions_course.has_course_permission_own,
            user: _.cloneDeep(res.locals.authn_user),
            role: permissions_course_instance.role,
            mode: authn_mode,
            has_instructor_view: permissions_course_instance.has_instructor_view,
            has_instructor_edit: permissions_course_instance.has_instructor_edit,
            course_role: permissions_course.course_role,
            has_course_permission_view: permissions_course.has_course_permission_view,
            has_course_permission_edit: permissions_course.has_course_permission_edit,
            has_course_permission_own: permissions_course.has_course_permission_own,
        };
        res.locals.user = res.locals.authz_data.user;
        // FIXME: debugging for #422
        logger.debug('Preliminary authz_data', res.locals.authz_data);

        // check whether we are requesting user data override
        if (!req.cookies.pl_requested_uid && !req.cookies.pl_requested_role && !req.cookies.pl_requested_mode && !req.cookies.pl_requested_date) {
            // no user data override, just continue
            return next();
        }

        // We are trying to override the user data.
        // Ensure we are enrolled in this course (we are already authorized, so this must be ok).
        var params = {
            course_instance_id: res.locals.course_instance.id,
            user_id: res.locals.authn_user.user_id,
            role: res.locals.authz_data.authn_role,
        };
        sqldb.query(sql.ensure_enrollment, params, function(err, _result) {
            if (ERR(err, next)) return;

            // now do the actual override
            var params = {
                authn_user_id: res.locals.authn_user.user_id,
                authn_role: res.locals.authz_data.authn_role,
                server_mode: res.locals.authz_data.authn_mode,
                req_date: res.locals.req_date,
                course_instance_id: req.params.course_instance_id,
                requested_uid: (req.cookies.pl_requested_uid ? req.cookies.pl_requested_uid : res.locals.authz_data.user.uid),
                requested_role: (req.cookies.pl_requested_role ? req.cookies.pl_requested_role : res.locals.authz_data.role),
                requested_mode: (req.cookies.pl_requested_mode ? req.cookies.pl_requested_mode : res.locals.authz_data.mode),
                requested_date: (req.cookies.pl_requested_date ? req.cookies.pl_requested_date : res.locals.req_date),
            };
            sqldb.queryZeroOrOneRow(sql.select_effective_authz_data, params, function(err, result) {
                if (ERR(err, next)) return;
                if (result.rowCount == 0) return next(error.make(403, 'Access denied'));

                _.assign(res.locals.authz_data, result.rows[0]);
                res.locals.req_date = result.rows[0].req_date;
                // remove all course permissions if we are emulating another user
                res.locals.authz_data.course_role = 'None';
                res.locals.authz_data.has_course_permission_view = false;
                res.locals.authz_data.has_course_permission_edit = false;
                res.locals.authz_data.has_course_permission_own = false;
                // FIXME: debugging for #422
                logger.debug('Overridden authz_data', res.locals.authz_data);
                res.locals.user = res.locals.authz_data.user;
                next();
            });
        });
    });
};
