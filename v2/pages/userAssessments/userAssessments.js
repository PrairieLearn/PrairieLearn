var ERR = require('async-stacktrace');
var _ = require('lodash');
var path = require('path');
var csvStringify = require('csv').stringify;
var express = require('express');
var router = express.Router();

var logger = require('../../lib/logger');
var sqldb = require('../../lib/sqldb');
var sqlLoader = require('../../lib/sql-loader');

var sql = sqlLoader.load(path.join(__dirname, 'userAssessments.sql'));

router.get('/', function(req, res, next) {
    var params = {
        courseInstanceId: res.locals.course_instance.id,
        userId: res.locals.user.id,
        uid: res.locals.user.uid,
        mode: req.mode,
        role: res.locals.enrollment.role,
    };
    sqldb.query(sql.all, params, function(err, result) {
        if (ERR(err, next)) return;
        res.locals.rows = result.rows;
        res.render(path.join(__dirname, 'userAssessments'), res.locals);
    });
});

module.exports = router;
