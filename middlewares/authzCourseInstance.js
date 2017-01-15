var ERR = require('async-stacktrace');
var _ = require('lodash');
var moment = require('moment-timezone');

var logger = require('../lib/logger');
var config = require('../lib/config');
var error = require('../lib/error');
var sqldb = require('../lib/sqldb');
var sqlLoader = require('../lib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

function serverMode(req) {
    var mode = 'Public';
    var clientIP = req.headers['x-forwarded-for'];
    if (!clientIP) {
        clientIP = req.ip;
    }
    if (_(clientIP).isString()) {
        var ipParts = clientIP.split('.');
        if (ipParts.length == 4) {
            try {
                n1 = parseInt(ipParts[0]);
                n2 = parseInt(ipParts[1]);
                n3 = parseInt(ipParts[2]);
                n4 = parseInt(ipParts[3]);
                // Grainger 57
                if (n1 == 192 && n2 == 17 && n3 == 180 && n4 >= 128 && n4 <= 255) {
                    mode = 'Exam';
                }
                if (moment.tz("2016-12-10T00:00:01", config.timezone).isBefore()
                    && moment.tz("2016-12-16T23:59:59", config.timezone).isAfter()) {
                    // DCL L416
                    if (n1 == 130 && n2 == 126 && n3 == 246 && n4 >= 150 && n4 <= 190) {
                        mode = 'Exam';
                    }
                    // DCL L422
                    if (n1 == 130 && n2 == 126 && n3 == 246 && n4 >= 191 && n4 <= 194) {
                        mode = 'Exam';
                    }
                    // DCL L520
                    if (n1 == 130 && n2 == 126 && n3 == 246 && n4 >= 36 && n4 <= 65) {
                        mode = 'Exam';
                    }
                    // DCL hot-spares
                    if (n1 == 130 && n2 == 126 && n3 == 246 && n4 >= 20 && n4 <= 23) {
                        mode = 'Exam';
                    }
                }
                if (moment.tz("2016-12-13T00:00:01", config.timezone).isBefore()
                    && moment.tz("2016-12-16T23:59:59", config.timezone).isAfter()) {
                    // DCL L440
                    if (n1 == 130 && n2 == 126 && n3 == 246 && n4 == 144) {
                        mode = 'Exam';
                    }
                    if (n1 == 130 && n2 == 126 && n3 == 246 && n4 >= 78 && n4 <= 106) {
                        mode = 'Exam';
                    }
                }
            } catch (e) {} // do nothing, so stay in 'Public' mode
        }
    }
    return mode;
};

module.exports = function(req, res, next) {

    var params = {
        authn_user_id: res.locals.authn_user.user_id,
        course_instance_id: req.params.course_instance_id,
        is_administrator: res.locals.is_administrator,
    };
    sqldb.queryZeroOrOneRow(sql.select_authz_data, params, function(err, result) {
        if (ERR(err, next)) return;
        if (result.rowCount == 0) return next(error.make(403, 'Access denied'));

        res.locals.course = result.rows[0].course;
        res.locals.course_instance = result.rows[0].course_instance;

        var authn_role = result.rows[0].authn_role;
        var authn_has_instructor_view = result.rows[0].authn_has_instructor_view;
        var authn_has_instructor_edit = result.rows[0].authn_has_instructor_edit;

        var permissions_course_instance = result.rows[0].permissions_course_instance;
        var permissions_course = result.rows[0].permissions_course;

        // effective user data defaults to auth user data
        var authn_mode = serverMode(req);
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

        // handle user data override
        if (req.cookies.pl_requested_uid || req.cookies.pl_requested_role || req.cookies.pl_requested_mode) {
            var params = {
                authn_user_id: res.locals.authn_user.user_id,
                authn_role: res.locals.authz_data.authn_role,
                server_mode: res.locals.authz_data.authn_mode,
                course_instance_id: req.params.course_instance_id,
                requested_uid: (req.cookies.pl_requested_uid ? req.cookies.pl_requested_uid : res.locals.authz_data.user.uid),
                requested_role: (req.cookies.pl_requested_role ? req.cookies.pl_requested_role : res.locals.authz_data.role),
                requested_mode: (req.cookies.pl_requested_mode ? req.cookies.pl_requested_mode : res.locals.authz_data.mode),
            };
            sqldb.queryZeroOrOneRow(sql.select_effective_authz_data, params, function(err, result) {
                if (ERR(err, next)) return;
                if (result.rowCount == 0) return next(error.make(403, 'Access denied'));

                _.assign(res.locals.authz_data, result.rows[0]);
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
        } else {
            // no user data override, just continue
            next();
        }
    });
};
