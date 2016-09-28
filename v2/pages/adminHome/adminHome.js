var ERR = require('async-stacktrace');
var _ = require('lodash');
var path = require('path');
var express = require('express');
var router = express.Router();

var logger = require('../../logger');
var sqldb = require('../../sqldb');
var sqlLoader = require('../../sql-loader');

var sql = sqlLoader.load(path.join(__dirname, 'adminHome.sql'));

router.get('/', function(req, res, next) {
    var params = {uid: res.locals.auth_data.auth_uid};
    sqldb.query(sql.courses, params, function(err, result) {
        if (ERR(err, next)) return;
        res.locals.rows = result.rows;
        res.render(path.join(__dirname, 'adminHome'), res.locals);
    });
});

module.exports = router;
