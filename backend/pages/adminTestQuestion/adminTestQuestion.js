var _ = require('underscore');
var path = require('path');
var csvStringify = require('csv').stringify;
var express = require('express');
var router = express.Router();

var logger = require('../../logger');
var sqldb = require('../../sqldb');
var sqlLoader = require('../../sql-loader');

var sql = sqlLoader.load(path.join(__dirname, 'adminTestQuestion.sql'));

router.get('/', function(req, res, next) {
    var params = [req.locals.testQuestionId];
    sqldb.query(sql.all, params, function(err, result) {
        if (err) {logger.error('adminTestQuestion query failed', err); return res.status(500).end();}
        if (result.rowCount !== 1) {logger.error('adminTestQuestion no results', err); return res.status(500).end();}
        var locals = _.extend({
            result: result.rows[0],
        }, req.locals);
        res.render(path.join(__dirname, 'adminTestQuestion'), locals);
    });
});

module.exports = router;
