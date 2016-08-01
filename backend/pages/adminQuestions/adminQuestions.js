var ERR = require('async-stacktrace');
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
        if (ERR(err, next)) return;
        req.locals.questions = result.rows;

        var params = [req.locals.course.id];
        sqldb.query(sql.tags, params, function(err, result) {
            if (ERR(err, next)) return;
            req.locals.allTags = result.rows;
        
            var params = [req.locals.courseInstanceId];
            sqldb.query(sql.tests, params, function(err, result) {
                if (ERR(err, next)) return;
                req.locals.allTests = result.rows;
                
                res.render('pages/adminQuestions/adminQuestions', req.locals);
            });
        });
    });
});

module.exports = router;
