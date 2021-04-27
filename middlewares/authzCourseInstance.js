var ERR = require('async-stacktrace');
var _ = require('lodash');

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
        ip: req.ip,
        force_mode: (config.authType == 'none' && req.cookies.pl_requested_mode) ? req.cookies.pl_requested_mode : null,
    };
    sqldb.queryZeroOrOneRow(sql.select_authz_data, params, function(err, result) {
        if (ERR(err, next)) return;
        if (result.rowCount == 0) return next(error.make(403, 'Access denied'));

        var authn_mode = result.rows[0].mode;
        res.locals.course = result.rows[0].course;
        res.locals.course_instance = result.rows[0].course_instance;
        res.locals.editable_courses = result.rows[0].editable_courses;
        res.locals.viewable_courses = result.rows[0].viewable_courses;
        res.locals.course_instances = result.rows[0].course_instances;

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
                if (result.rowCount == 0) {
                    // The effective user has been denied access. For a real user, two things would be true:
                    //
                    //  1) authn_user would exist
                    //  2) authz_data would not exist
                    //
                    // Unfortunately, for the effective user, both authn_user and authz_data exist but are
                    // "wrong" in the sense that they are consistent with the real user and not the effective
                    // user. This screws up various things on the error page.
                    //
                    // As a fix for now, we will remove authz_data and will set a flag saying that the
                    // effective user has been denied access to the course instance - this will allow, for
                    // example, the user dropdown in the navbar to be hidden. It is likely that a better
                    // solution can be found when this code is all rewritten.
                    delete res.locals.authz_data;
                    res.locals.effective_user_has_no_access_to_course_instance = true;

                    // Tell the real user what happened and how to reset the effective user.
                    let err = error.make(403, 'Access denied');
                    err.info =  `<p>You have changed the effective user to one with these properties:</p>` +
                                `<div class="container"><pre class="bg-dark text-white rounded p-2">` +
                                `uid = ${params.requested_uid}\n` +
                                `role = ${params.requested_role}\n` +
                                `mode = ${params.requested_mode}\n` +
                                `</pre></div>` +
                                `<p>This user does not have access to the course instance <code>${res.locals.course_instance.short_name}</code> (with long name "${res.locals.course_instance.long_name}").` +
                                `<p>To reset the effective user, return to the <a href="${res.locals.homeUrl}">PrairieLearn home page</a>.</p>`;
                    return next(err);
                }

                res.locals.authz_data.user = result.rows[0].user;
                res.locals.authz_data.role = result.rows[0].role;
                res.locals.authz_data.mode = result.rows[0].mode;
                res.locals.req_date = result.rows[0].req_date;

                // Make sure that we never grant extra permissions
                res.locals.authz_data.has_instructor_view = res.locals.authz_data.has_instructor_view && result.rows[0].has_instructor_view;
                res.locals.authz_data.has_instructor_edit = res.locals.authz_data.has_instructor_edit && result.rows[0].has_instructor_edit;
                res.locals.authz_data.has_course_permission_view = res.locals.authz_data.has_course_permission_view && result.rows[0].permissions_course.has_course_permission_view;
                res.locals.authz_data.has_course_permission_edit = res.locals.authz_data.has_course_permission_edit && result.rows[0].permissions_course.has_course_permission_edit;
                res.locals.authz_data.has_course_permission_own = res.locals.authz_data.has_course_permission_own && result.rows[0].permissions_course.has_course_permission_own;

                // NOTE: When this code is all rewritten, you may want to throw an error if
                // the user tries to emulate another user with greater permissions, so that
                // it is clear why these permissions aren't granted.

                res.locals.user = res.locals.authz_data.user;
                next();
            });
        });
    });
};
