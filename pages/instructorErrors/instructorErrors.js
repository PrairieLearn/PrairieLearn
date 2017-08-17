var ERR = require('async-stacktrace');
var _ = require('lodash');
var express = require('express');
var router = express.Router();

var error = require('../../lib/error');
var paginate = require('../../lib/paginate');
var sqldb = require('../../lib/sqldb');
var sqlLoader = require('../../lib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

const pageSize = 100;

router.get('/', function(req, res, next) {
    var params = {
        course_id: res.locals.course.id,
    };
    sqldb.query(sql.errors_count, params, function(err, result) {
        if (ERR(err, next)) return;
        if (result.rowCount != 2) return next(new Error('unable to obtain error count, rowCount = ' + result.rowCount));
        res.locals.closedCount = result.rows[0].count;
        res.locals.openCount = result.rows[1].count;
        res.locals.errorCount = res.locals.closedCount + res.locals.openCount;

        _.assign(res.locals, paginate.pages(req.query.page, res.locals.errorCount, pageSize));
        
        var params = {
            course_id: res.locals.course.id,
            offset: (res.locals.currPage - 1) * pageSize,
            limit: pageSize,
        };
        sqldb.query(sql.select_errors, params, function(err, result) {
            if (ERR(err, next)) return;

            res.locals.rows = result.rows;
            res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
        });
    });
});

router.post('/', function(req, res, next) {
    if (!res.locals.authz_data.has_instructor_edit) return next();
    if (req.body.__action == 'open') {
        let params = [
            req.body.error_id,
            true, // open status
            res.locals.course.id,
            res.locals.authn_user.user_id,
        ];
        sqldb.call('errors_update_open', params, function(err, _result) {
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
        });
    } else if (req.body.__action == 'close') {
        let params = [
            req.body.error_id,
            false, // open status
            res.locals.course.id,
            res.locals.authn_user.user_id,
        ];
        sqldb.call('errors_update_open', params, function(err, _result) {
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
        });
    } else if (req.body.__action == 'close_all') {
        let params = [
            false, // open status
            res.locals.course.id,
            res.locals.authn_user.user_id,
        ];
        sqldb.call('errors_update_open_all', params, function(err, _result) {
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
        });
    } else {
        return next(error.make(400, 'unknown __action', {locals: res.locals, body: req.body}));
    }
});

module.exports = router;
