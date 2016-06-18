var _ = require('underscore');
var path = require('path');
var csvStringify = require('csv').stringify;
var express = require('express');
var router = express.Router();

var logger = require('../../logger');
var sqldb = require('../../sqldb');
var sqlLoader = require('../../sql-loader');

var sql = sqlLoader.load(path.join(__dirname, 'adminQuestions.sql'));

router.get('/', function(req, res, next) {
    var params = [req.locals.courseInstanceId];
    sqldb.query(sql.questions, params, function(err, result) {
        if (err) {logger.error('adminQuestions questions query failed', err); return res.status(500).end();}
        req.locals.questions = result.rows;

        var params = [req.locals.courseInstanceId];
        sqldb.query(sql.tests, params, function(err, result) {
            if (err) {logger.error('adminQuestions tests query failed', err); return res.status(500).end();}
            req.locals.tests = result.rows;

            res.render('pages/adminQuestions/adminQuestions', req.locals);
        });
    });
});

module.exports = router;
