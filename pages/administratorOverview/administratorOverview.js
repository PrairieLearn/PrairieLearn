var ERR = require('async-stacktrace');
var _ = require('lodash');
var express = require('express');
var router = express.Router();

var error = require('@prairielearn/prairielib/error');
var sqldb = require('@prairielearn/prairielib/sql-db');
var sqlLoader = require('@prairielearn/prairielib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/', function(req, res, next) {
    sqldb.queryOneRow(sql.select, [], function(err, result) {
        if (ERR(err, next)) return;

        _.assign(res.locals, result.rows[0]);
        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    });
});

router.post('/', function(req, res, next) {
    if (!res.locals.is_administrator) return next(new Error('Insufficient permissions'));
    if (req.body.__action == 'administrators_insert_by_user_uid') {
        let params = [
            req.body.uid,
            res.locals.authn_user.user_id,
        ];
        sqldb.call('administrators_insert_by_user_uid', params, function(err, _result) {
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
        });
    } else if (req.body.__action == 'administrators_delete_by_user_id') {
        let params = [
            req.body.user_id,
            res.locals.authn_user.user_id,
        ];
        sqldb.call('administrators_delete_by_user_id', params, function(err, _result) {
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
        });
    } else if (req.body.__action == 'courses_insert') {
        let params = [
            req.body.short_name,
            req.body.title,
            req.body.display_timezone,
            req.body.path,
            req.body.repository,
            res.locals.authn_user.user_id,
        ];
        sqldb.call('courses_insert', params, function(err, _result) {
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
        });
    } else if (req.body.__action == 'courses_update_column') {
        let params = [
            req.body.course_id,
            req.body.column_name,
            req.body.value,
            res.locals.authn_user.user_id,
        ];
        sqldb.call('courses_update_column', params, function(err, _result) {
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
        });
    } else if (req.body.__action == 'courses_delete') {
        let params = {
            course_id: req.body.course_id,
        };
        sqldb.queryZeroOrOneRow(sql.select_course, params, function(err, result) {
            if (ERR(err, next)) return;
            if (result.rowCount != 1) return next(new Error('course not found'));

            var short_name = result.rows[0].short_name;
            if (req.body.confirm_short_name != short_name) {
                return next(new Error('deletion aborted: confirmation string "'
                                      + req.body.confirm_short_name
                                      + '" did not match expected value of "' + short_name + '"'));
            }

            var params = [
                req.body.course_id,
                res.locals.authn_user.user_id,
            ];
            sqldb.call('courses_delete', params, function(err, _result) {
                if (ERR(err, next)) return;
                res.redirect(req.originalUrl);
            });
        });
    } else {
        return next(error.make(400, 'unknown __action', {locals: res.locals, body: req.body}));
    }
});

module.exports = router;
