var ERR = require('async-stacktrace');
var _ = require('lodash');
var path = require('path');
var csvStringify = require('csv').stringify;
var express = require('express');
var router = express.Router();

var logger = require('../../lib/logger');
var sqldb = require('../../lib/sqldb');
var sqlLoader = require('../../lib/sql-loader');

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
    if (req.body.postAction == 'addUser') {
        var params = [
            req.body.uid,
            res.locals.authn_user.id,
        ];
        sqldb.call('administrators_add_by_uid', params, function(err, result) {
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
        });
    } else if (req.body.postAction == 'deleteUser') {
        var params = [
            req.body.user_id,
            res.locals.authn_user.id,
        ];
        sqldb.call('administrators_delete_user', params, function(err, result) {
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
        });
    } else {
        return next(error.make(400, 'unknown postAction', {locals: res.locals, body: req.body}));
    }
});

module.exports = router;
