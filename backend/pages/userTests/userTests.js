var _ = require('underscore');
var path = require('path');
var csvStringify = require('csv').stringify;
var express = require('express');
var router = express.Router();

var logger = require('../../logger');
var sqldb = require('../../sqldb');
var sqlLoader = require('../../sql-loader');

var sql = sqlLoader.load(path.join(__dirname, 'userTests.sql'));

router.get('/', function(req, res, next) {
    var params = {
        courseInstanceId: req.locals.courseInstanceId,
        userId: req.locals.user.id,
        uid: req.locals.user.uid,
        mode: req.mode,
        role: req.locals.enrollment.role,
    };
    sqldb.query(sql.all, params, function(err, result) {
        if (err) return next(err);
        var locals = _.extend({
            rows: result.rows,
        }, req.locals);
        res.render(path.join(__dirname, 'userTests'), locals);
    });
});

module.exports = router;
