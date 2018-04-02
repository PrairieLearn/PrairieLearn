var ERR = require('async-stacktrace');
var _ = require('lodash');
var express = require('express');
var router = express.Router();

var error = require('@prairielearn/prairielib/error');
var sqldb = require('@prairielearn/prairielib/sql-db');
var sqlLoader = require('@prairielearn/prairielib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/', function(req, res, next) {
    if (!res.locals.authz_data.authn_has_instructor_view) return next();
    var params = {
        authn_user_id: res.locals.authn_user.user_id,
        course_instance_id: res.locals.course_instance.id,
        authn_role: res.locals.authz_data.authn_role,
    };
    sqldb.queryOneRow(sql.select, params, function(err, result) {
        if (ERR(err, next)) return;
        _.assign(res.locals, result.rows[0]);

        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    });
});

router.post('/', function(req, res, next) {
    if (!res.locals.authz_data.authn_has_instructor_view) return next();
    if (req.body.__action == 'reset') {
        res.clearCookie('pl_requested_uid');
        res.clearCookie('pl_requested_role');
        res.clearCookie('pl_requested_mode');
        res.redirect(req.originalUrl);
    } else if (req.body.__action == 'changeUid') {
        res.cookie('pl_requested_uid', req.body.pl_requested_uid, {maxAge: 60 * 60 * 1000});
        res.redirect(req.originalUrl);
    } else if (req.body.__action == 'changeRole') {
        res.cookie('pl_requested_role', req.body.pl_requested_role, {maxAge: 60 * 60 * 1000});
        res.redirect(req.originalUrl);
    } else if (req.body.__action == 'changeMode') {
        res.cookie('pl_requested_mode', req.body.pl_requested_mode, {maxAge: 60 * 60 * 1000});
        res.redirect(req.originalUrl);
    } else {
        return next(error.make(400, 'unknown action: ' + res.locals.__action, {__action: req.body.__action, body: req.body}));
    }
});

module.exports = router;
