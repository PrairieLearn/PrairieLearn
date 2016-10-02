var ERR = require('async-stacktrace');
var _ = require('lodash');
var moment = require('moment-timezone');

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
                if (moment.tz("2016-05-06T00:00:01", config.timezone).isBefore()
                    && moment.tz("2016-05-13T23:59:59", config.timezone).isAfter()) {
                    // DCL L520
                    if (n1 == 130 && n2 == 126 && n3 == 246 && n4 >= 36 && n4 <= 76) {
                        mode = 'Exam';
                    }
                }
                if (moment.tz("2016-05-09T00:00:01", config.timezone).isBefore()
                    && moment.tz("2016-05-13T23:59:59", config.timezone).isAfter()) {
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
        user_id: res.locals.authn_user.id,
        course_instance_id: req.params.course_instance_id,
    };
    sqldb.queryOneRow(sql.select_authn_data, params, function(err, result) {
        if (ERR(err, next)) return;
        res.locals.authn_enrollment = result.rows[0].enrollment;
        res.locals.authn_authz_admin = result.rows[0].authz_admin;

        // effective user data defaults to auth user data
        res.locals.authz_data = {
            role: res.locals.authn_enrollment.role,
            mode: serverMode(req),
            user: _.cloneDeep(res.locals.authn_user),
            authz_admin: res.locals.authn_authz_admin,
        };
        res.locals.user = res.locals.authz_data.user;

        // handle user data override
        if (req.cookies.userData) {
            var cookieUserData;
            try {
                cookieUserData = JSON.parse(req.cookies.userData);
            } catch (e) {
                return next(error.make(403, "Error parsing cookies.userData as JSON", {userData: req.cookies.userData}));
            }
            var requested_uid = res.locals.authz_data.user.uid;
            var requested_mode = res.locals.authz_data.mode;
            var requested_role = res.locals.authz_data.role;
            if (cookieUserData.uid) requested_uid = cookieUserData.uid;
            if (cookieUserData.mode) requested_mode = cookieUserData.mode;
            if (cookieUserData.role) requested_role = cookieUserData.role;
            var params = {
                authn_user_id: res.locals.authn_user.id,
                server_mode: res.locals.authz_data.mode,
                course_instance_id: req.params.course_instance_id,
                requested_uid: requested_uid,
                requested_mode: requested_mode,
                requested_role: requested_role,
            };
            sqldb.queryOneRow(sql.select_effective_authz_data, params, function(err, result) {
                if (ERR(err, next)) return;
                res.locals.authz_data = result.rows[0];
                res.locals.user = res.locals.authz_data.user;
                next();
            });
        } else {
            // no user data override, just continue
            next();
        }
    });
};
