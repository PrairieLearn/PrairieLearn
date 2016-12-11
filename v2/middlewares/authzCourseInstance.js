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
        authn_user_id: res.locals.authn_user.id,
        course_instance_id: req.params.course_instance_id,
    };
    sqldb.queryOneRow(sql.select_authn_data, params, function(err, result) {
        if (ERR(err, next)) return;
        var authn_role = result.rows[0].authn_role;
        var authn_has_admin_view = result.rows[0].authn_has_admin_view;
        var authn_has_admin_edit = result.rows[0].authn_has_admin_edit;

        // effective user data defaults to auth user data
        var authn_mode = serverMode(req);
        res.locals.authz_data = {
            authn_user: _.cloneDeep(res.locals.authn_user),
            authn_role: authn_role,
            authn_mode: authn_mode,
            authn_has_admin_view: authn_has_admin_view,
            authn_has_admin_edit: authn_has_admin_edit,
            user: _.cloneDeep(res.locals.authn_user),
            role: authn_role,
            mode: authn_mode,
            has_admin_view: authn_has_admin_view,
            has_admin_edit: authn_has_admin_edit,
        };
        res.locals.user = res.locals.authz_data.user;

        // handle user data override
        if (req.cookies.requestedUid || req.cookies.requestedRole || req.cookies.requestedMode) {
            var params = {
                authn_user_id: res.locals.authn_user.id,
                server_mode: res.locals.authz_data.mode,
                course_instance_id: req.params.course_instance_id,
                requested_uid: (req.cookies.requestedUid ? req.cookies.requestedUid : res.locals.authz_data.user.uid),
                requested_role: (req.cookies.requestedRole ? req.cookies.requestedRole : res.locals.authz_data.role),
                requested_mode: (req.cookies.requestedMode ? req.cookies.requestedMode : res.locals.authz_data.mode),
            };
            sqldb.queryOneRow(sql.select_effective_authz_data, params, function(err, result) {
                if (ERR(err, next)) return;
                _.assign(res.locals.authz_data, result.rows[0]);
                res.locals.user = res.locals.authz_data.user;
                next();
            });
        } else {
            // no user data override, just continue
            next();
        }
    });
};
