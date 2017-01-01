var ERR = require('async-stacktrace');
var _ = require('lodash');
var moment = require('moment-timezone');

var logger = require('../lib/logger');
var config = require('../lib/config');
var error = require('../lib/error');
var sqldb = require('../lib/sqldb');
var sqlLoader = require('../lib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

module.exports = function(req, res, next) {
    var params = {
        authn_user_id: res.locals.authn_user.id,
        course_id: req.params.course_id,
        is_administrator: res.locals.is_administrator,
    };
    sqldb.queryZeroOrOneRow(sql.select_authz_data, params, function(err, result) {
        if (ERR(err, next)) return;
        if (result.rowCount == 0) return next(error.make(403, 'Access denied'));

        res.locals.course = result.rows[0].course;

        var authn_course_role = result.rows[0].authn_course_role;
        var authn_has_permission_view = result.rows[0].authn_has_permission_view;
        var authn_has_permission_edit = result.rows[0].authn_has_permission_edit;
        var authn_has_permission_own = result.rows[0].authn_has_permission_own;

        res.locals.authz_data = {
            authn_user: _.cloneDeep(res.locals.authn_user),
            authn_course_role: authn_course_role,
            authn_has_permission_view: authn_has_permission_view,
            authn_has_permission_edit: authn_has_permission_edit,
            authn_has_permission_own: authn_has_permission_own,
            user: _.cloneDeep(res.locals.authn_user),
            course_role: authn_course_role,
            has_permission_view: authn_has_permission_view,
            has_permission_edit: authn_has_permission_edit,
            has_permission_own: authn_has_permission_own,
        };
        res.locals.user = res.locals.authz_data.user;

        // FIXME: Implement effective users for course pages

        next();
    });
};
