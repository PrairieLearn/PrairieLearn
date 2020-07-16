const ERR = require('async-stacktrace');
const _ = require('lodash');
const async = require('async');

const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));

const moment = require('moment');
const config = require('../lib/config');
const error = require('@prairielearn/prairielib/error');
const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');

const sql = sqlLoader.loadSqlEquiv(__filename);

module.exports = function(req, res, next) {
    const isCourseInstance = Boolean(req.params.course_instance_id);

    // Apply login_type to course and course instance roles
    //
    // On authentication (see middlewares/authn.js), we check if the user has
    // requested a different login type. The flag res.locals.is_administrator,
    // in particular, is already consistent with the requested login type. So,
    // there is no need to check the login type again and apply changes to the
    // is_administrator flag.
    //
    // On the other hand, the course role and course instance role is not yet
    // consistent with the requested login type. In particular, if the authn
    // user has requested student login, then we need to request 'None' roles,
    // which are consistent with being neither adminstrator nor instructor.
    //
    // Note that the choice of login type changes "the authn user" for the
    // purpose of creating authz_data and not only the effective user.
    let req_course_role = null;
    let req_course_instance_role = null;
    if (res.locals.login_type_changed && res.locals.login_type == 'Student') {
        req_course_role = 'None';
        req_course_instance_role = 'None';
    }

    // Note that req.params.course_id and req.params.course_instance_id are strings and not
    // numbers - this is why we can use the pattern "id ? id : null" to check if they exist.
    const params = {
        user_id: res.locals.authn_user.user_id,
        course_id: req.params.course_id ? req.params.course_id : null,
        course_instance_id: req.params.course_instance_id ? req.params.course_instance_id : null,
        is_administrator: res.locals.is_administrator,
        ip: req.ip,
        req_date: res.locals.req_date,
        req_mode: (config.authType == 'none' && req.cookies.pl_requested_mode) ? req.cookies.pl_requested_mode : null,
        req_course_role: req_course_role,
        req_course_instance_role: req_course_instance_role,
    };

    if ((params.course_id == null) && (params.course_instance_id == null)) {
        next(error.make(403, 'Access denied (both course_id and course_instance_id are null)'));
    }

    sqldb.queryZeroOrOneRow(sql.select_authz_data, params, function(err, result) {
        if (ERR(err, next)) return;
        if (result.rowCount == 0) return next(error.make(403, 'Access denied'));

        res.locals.course = result.rows[0].course;

        const authn_courses = result.rows[0].courses ? result.rows[0].courses : [];
        const authn_course_instances = result.rows[0].course_instances ? result.rows[0].course_instances : [];
        const permissions_course = result.rows[0].permissions_course;
        res.locals.authz_data = {
            authn_user: _.cloneDeep(res.locals.authn_user),
            authn_mode: result.rows[0].mode,
            authn_is_administrator: res.locals.is_administrator,
            authn_course_role: permissions_course.course_role,
            authn_has_course_permission_preview: permissions_course.has_course_permission_preview,
            authn_has_course_permission_view: permissions_course.has_course_permission_view,
            authn_has_course_permission_edit: permissions_course.has_course_permission_edit,
            authn_has_course_permission_own: permissions_course.has_course_permission_own,
            authn_courses: authn_courses,
            authn_course_instances: authn_course_instances,
            user: _.cloneDeep(res.locals.authn_user),
            mode: result.rows[0].mode,
            is_administrator: res.locals.is_administrator,
            course_role: permissions_course.course_role,
            has_course_permission_preview: permissions_course.has_course_permission_preview,
            has_course_permission_view: permissions_course.has_course_permission_view,
            has_course_permission_edit: permissions_course.has_course_permission_edit,
            has_course_permission_own: permissions_course.has_course_permission_own,
            courses: authn_courses,
            course_instances: authn_course_instances,
        };

        debug(res.locals.authz_data.course_instances);

        if (isCourseInstance) {
            res.locals.course_instance = result.rows[0].course_instance;

            const permissions_course_instance = result.rows[0].permissions_course_instance;
            res.locals.authz_data.authn_course_instance_role = permissions_course_instance.course_instance_role;
            res.locals.authz_data.authn_has_course_instance_permission_view = permissions_course_instance.has_course_instance_permission_view;
            res.locals.authz_data.authn_has_course_instance_permission_edit = permissions_course_instance.has_course_instance_permission_edit;
            res.locals.authz_data.authn_is_enrolled_with_access = permissions_course_instance.is_enrolled_with_access;
            res.locals.authz_data.course_instance_role = permissions_course_instance.course_instance_role;
            res.locals.authz_data.has_course_instance_permission_view = permissions_course_instance.has_course_instance_permission_view;
            res.locals.authz_data.has_course_instance_permission_edit = permissions_course_instance.has_course_instance_permission_edit;
            res.locals.authz_data.is_enrolled_with_access = permissions_course_instance.is_enrolled_with_access;
        }

        res.locals.user = res.locals.authz_data.user;

        // Check if it is necessary to request a user data override - if not, return
        let overrides = [];
        if (req.cookies.pl_requested_uid) {
            overrides.push({'name': 'UID', 'value': req.cookies.pl_requested_uid, 'cookie': 'pl_requested_uid'});
        }
        if (req.cookies.pl_requested_course_role) {
            overrides.push({'name': 'Course role', 'value': req.cookies.pl_requested_course_role, 'cookie': 'pl_requested_course_role'});
        }
        if (req.cookies.pl_requested_course_instance_role) {
            overrides.push({'name': 'Course instance role', 'value': req.cookies.pl_requested_course_instance_role, 'cookie': 'pl_requested_course_instance_role'});
        }
        if (req.cookies.pl_requested_mode) {
            overrides.push({'name': 'Mode', 'value': req.cookies.pl_requested_mode, 'cookie': 'pl_requested_mode'});
        }
        if (req.cookies.pl_requested_date) {
            overrides.push({'name': 'Date', 'value': req.cookies.pl_requested_date, 'cookie': 'pl_requested_date'});
        }
        if (overrides.length == 0) {
             return next();
        }

        // The authn_user must be at least an Editor in course to request a user data override
        if (!res.locals.authz_data.authn_has_course_permission_edit) {
            overrides.forEach((override) => {
                debug(`clearing cookie: ${override.cookie}`);
                res.clearCookie(override.cookie);
            });

            let err = error.make(403, 'Access denied');
            err.info =  `<p>You must be at least an Editor in this course in order to change the effective ` +
                        `user. Instead, your course role is: ${res.locals.authz_data.authn_course_role}. ` +
                        `All requested changes to the effective user have been removed.</p>`;
            return callback(err);
        }

        // We are trying to override the user data.
        debug('trying to override the user data');
        debug(req.cookies);

        // Get roles
        let user = res.locals.authz_data.user;
        let is_administrator = res.locals.is_administrator;
        req_course_role = (req.cookies.pl_requested_course_role ? req.cookies.pl_requested_course_role : req_course_role);
        req_course_instance_role = (req.cookies.pl_requested_course_instance_role ? req.cookies.pl_requested_course_instance_role : req_course_instance_role);

        async.series([
            //
            // // FIXME
            //
            // (callback) => {
            //     if (res.locals.course_instance) {
            //         // Ensure we are enrolled in this course instance (we are already authorized, so this must be ok).
            //         const params = {
            //             course_instance_id: res.locals.course_instance.id,
            //             user_id: res.locals.authn_user.user_id,
            //             role: res.locals.authz_data.authn_role,     // FIXME
            //         };
            //         sqldb.query(sql.ensure_enrollment, params, function(err, _result) {
            //             if (ERR(err, callback)) return;
            //             callback(null);
            //         });
            //     } else {
            //         callback(null);
            //     }
            // },
            (callback) => {
                if (req.cookies.pl_requested_uid) {
                    const params = {
                        uid: req.cookies.pl_requested_uid,
                    };

                    sqldb.queryZeroOrOneRow(sql.select_user, params, function(err, result) {
                        // Something went wrong - immediately return with error
                        if (ERR(err, callback)) return;

                        // No user was found - remove all override cookies and return with error
                        if (result.rowCount == 0) {
                            overrides.forEach((override) => {
                                debug(`clearing cookie: ${override.cookie}`);
                                res.clearCookie(override.cookie);
                            });

                            let err = error.make(403, 'Access denied');
                            err.info =  `<p>You have tried to change the effective user to one with uid ` +
                                        `<code>${req.cookies.pl_requested_uid}</code>, when no such user exists. ` +
                                        `All requested changes to the effective user have been removed.</p>`;
                            return callback(err);
                        }

                        // The effective user is an administrator and the authn user is not - remove
                        // all override cookies and return with error
                        if (result.rows[0].is_administrator && !is_administrator) {
                            overrides.forEach((override) => {
                                debug(`clearing cookie: ${override.cookie}`);
                                res.clearCookie(override.cookie);
                            });

                            let err = error.make(403, 'Access denied');
                            err.info =  `<p>You have tried to change the effective user to one who is an ` +
                                        `administrator, when you are not an administrator. ` +
                                        `All requested changes to the effective user have been removed.</p>`;
                            return callback(err);
                        }

                        is_administrator = result.rows[0].is_administrator;
                        user = _.cloneDeep(result.rows[0].user);

                        // FIXME: also override institution?
                        return callback(null);
                    });
                } else {
                    return callback(null);
                }
            },
            (callback) => {
                let req_date = res.locals.req_date;
                if (req.cookies.pl_requested_date) {
                    req_date = moment(req.cookies.pl_requested_date, moment.ISO_8601);
                    if (!req_date.isValid()) {
                        overrides.forEach((override) => {
                            debug(`clearing cookie: ${override.cookie}`);
                            res.clearCookie(override.cookie);
                        });

                        let err = error.make(403, 'Access denied');
                        err.info =  `<p>You have requested an invalid effective date: <code>${req.cookies.pl_requested_date}</code>. ` +
                                    `All requested changes to the effective user have been removed.</p>`;
                        return callback(err);
                    }

                    debug(`effective req_date = ${req_date}`);
                }

                const params = {
                    user_id: user.user_id,
                    course_id: req.params.course_id ? req.params.course_id : null,
                    course_instance_id: req.params.course_instance_id ? req.params.course_instance_id : null,
                    is_administrator: is_administrator,
                    ip: req.ip,
                    req_date: req_date,
                    req_mode: (req.cookies.pl_requested_mode ? req.cookies.pl_requested_mode : res.locals.authz_data.mode),
                    req_course_role: req_course_role,
                    req_course_instance_role: req_course_instance_role,
                };

                sqldb.queryZeroOrOneRow(sql.select_authz_data, params, function(err, result) {
                    // Something went wrong - immediately return with error
                    if (ERR(err, callback)) return;

                    // The effective user was denied access. For the real user, we would
                    // return with error. For the effective user, we remove all permissions
                    // and simply return (without error).
                    if (result.rowCount == 0) {
                        debug('The effective user has been denied access.');

                        res.locals.authz_data.user = user;
                        res.locals.authz_data.is_administrator = false;

                        res.locals.authz_data.course_role = 'None';
                        res.locals.authz_data.has_course_permission_preview = false;
                        res.locals.authz_data.has_course_permission_view = false;
                        res.locals.authz_data.has_course_permission_edit = false;
                        res.locals.authz_data.has_course_permission_own = false;

                        res.locals.authz_data.courses = [];
                        res.locals.authz_data.course_instances = [];

                        if (isCourseInstance) {
                            res.locals.authz_data.course_instance_role = 'None';
                            res.locals.authz_data.has_course_instance_permission_view = false;
                            res.locals.authz_data.has_course_instance_permission_edit = false;
                            res.locals.authz_data.is_enrolled_with_access = false;
                        }

                        res.locals.authz_data.overrides = overrides;

                        res.locals.user = res.locals.authz_data.user;

                        res.locals.authz_data.mode = params.req_mode;
                        res.locals.req_date = req_date;

                        return callback(null);
                    }

                    // The effective user is an Owner and the authn_user is not - remove
                    // all override cookies and return with error
                    //
                    // (note that the authn_user must be at least an Editor, so there is no
                    // need to check that the effective user is anything less than Owner)
                    if ((!res.locals.authz_data.authn_has_course_permission_own) && result.rows[0].permissions_course.has_course_permission_own) {
                        overrides.forEach((override) => {
                            debug(`clearing cookie: ${override.cookie}`);
                            res.clearCookie(override.cookie);
                        });

                        let err = error.make(403, 'Access denied');
                        err.info =  `<p>You have tried to change the effective user to one who is a ` +
                                    `course owner, when you are not a course owner. ` +
                                    `All requested changes to the effective user have been removed.</p>`;
                        return callback(err);
                    }

                    if (isCourseInstance) {
                        // The effective user is a Student Data Viewer and the authn_user is not -
                        // remove all override cookies and return with error
                        if ((!res.locals.authz_data.authn_has_course_instance_permission_view) && result.rows[0].permissions_course_instance.has_course_instance_permission_view) {
                            overrides.forEach((override) => {
                                debug(`clearing cookie: ${override.cookie}`);
                                res.clearCookie(override.cookie);
                            });

                            let err = error.make(403, 'Access denied');
                            err.info =  `<p>You have tried to change the effective user to one who can view ` +
                                        `student data in the course instance <code>${res.locals.course_instance.short_name}</code>, when ` +
                                        `you do not have permission to view these student data. ` +
                                        `All requested changes to the effective user have been removed.</p>`;
                            return callback(err);
                        }

                        // The effective user is a Student Data Editor and the authn_user is not -
                        // remove all override cookies and return with error
                        if ((!res.locals.authz_data.authn_has_course_instance_permission_edit) && result.rows[0].permissions_course_instance.has_course_instance_permission_edit) {
                            overrides.forEach((override) => {
                                debug(`clearing cookie: ${override.cookie}`);
                                res.clearCookie(override.cookie);
                            });

                            let err = error.make(403, 'Access denied');
                            err.info =  `<p>You have tried to change the effective user to one who can edit ` +
                                        `student data in the course instance <code>${res.locals.course_instance.short_name}</code>, when ` +
                                        `you do not have permission to edit these student data. ` +
                                        `All requested changes to the effective user have been removed.</p>`;
                            return callback(err);
                        }

                        // The effective user is a student (with no course or course instance role) with
                        // a different UID than the authn user, and the authn user is not a Student Data
                        // Editor - remove all override cookies and return with error
                        if ((req.cookies.pl_requested_uid && (req.cookies.pl_requested_uid != res.locals.authn_user.uid))   // effective user has a different uid from authn user
                            && result.rows[0].permissions_course_instance.is_enrolled_with_access                           // effective user is enrolled
                            && (result.rows[0].permissions_course_instance.course_instance_role == 'None')                  // effective user is not course instance staff
                            && (result.rows[0].permissions_course.course_role == 'None')                                    // effective user is not course staff
                            && (!res.locals.authz_data.authn_has_course_instance_permission_edit)) {                        // authn user is not a Student Data Editor
                            overrides.forEach((override) => {
                                debug(`clearing cookie: ${override.cookie}`);
                                res.clearCookie(override.cookie);
                            });

                            let err = error.make(403, 'Access denied');
                            err.info =  `<p>You have tried to change the effective user to one who is a student in the ` +
                                        `course instance <code>${res.locals.course_instance.short_name}</code>, when ` +
                                        `you do not have permission to edit student data in this course instance. ` +
                                        `All requested changes to the effective user have been removed.</p>`;
                            return callback(err);
                        }
                    }

                    res.locals.authz_data.user = user;
                    res.locals.authz_data.is_administrator = is_administrator;
                    res.locals.authz_data.course_role = result.rows[0].permissions_course.course_role;
                    res.locals.authz_data.has_course_permission_preview = result.rows[0].permissions_course.has_course_permission_preview;
                    res.locals.authz_data.has_course_permission_view = result.rows[0].permissions_course.has_course_permission_view;
                    res.locals.authz_data.has_course_permission_edit = result.rows[0].permissions_course.has_course_permission_edit;
                    res.locals.authz_data.has_course_permission_own = result.rows[0].permissions_course.has_course_permission_own;

                    // Empty courses (effective users are confined to one course)
                    res.locals.authz_data.courses = [];

                    // Update course_instances, adding a flag to disable any course
                    // instance that is not also in authn_course_instances (i.e., to
                    // which the authn user does not also have access)
                    //
                    // (Adding this flag is not necessary, actually, because the authn
                    //  user must be at least a course Editor, and so must have access
                    //  to all course instances. We will check anyway, just to be safe.)
                    //
                    res.locals.authz_data.course_instances = result.rows[0].course_instances ? result.rows[0].course_instances : [];
                    res.locals.authz_data.course_instances.forEach((ci) => {
                        ci.disabled = (! res.locals.authz_data.authn_course_instances.some((authn_ci) => {
                            return ci.id == authn_ci.id;
                        }));
                    });

                    if (isCourseInstance) {
                        res.locals.authz_data.course_instance_role = result.rows[0].permissions_course_instance.course_instance_role;
                        res.locals.authz_data.has_course_instance_permission_view = result.rows[0].permissions_course_instance.has_course_instance_permission_view;
                        res.locals.authz_data.has_course_instance_permission_edit = result.rows[0].permissions_course_instance.has_course_instance_permission_edit;
                        res.locals.authz_data.is_enrolled_with_access = result.rows[0].permissions_course_instance.is_enrolled_with_access;
                    }

                    res.locals.authz_data.overrides = overrides;

                    res.locals.user = res.locals.authz_data.user;

                    res.locals.authz_data.mode = result.rows[0].mode;
                    res.locals.req_date = req_date;

                    return callback(null);
                });
            }
        ], (err) => {
            if (ERR(err, next)) return;
            next();
        });
    });
};
