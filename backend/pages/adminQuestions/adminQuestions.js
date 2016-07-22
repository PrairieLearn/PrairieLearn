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
        if (err) return next(err);
        req.locals.questions = result.rows;

        var params = [req.locals.courseId];
        sqldb.query(sql.tags, params, function(err, result) {
            if (err) return next(err);
            console.log("tags", result);
            req.locals.allTags = result.rows;
        
            var params = [req.locals.courseInstanceId];
            sqldb.query(sql.tests, params, function(err, result) {
                console.log("tests", result);
                if (err) return next(err);
                req.locals.allTests = result.rows;
                
                res.render('pages/adminQuestions/adminQuestions', req.locals);
            });
        });
    });
});

module.exports = router;
