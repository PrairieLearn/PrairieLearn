var ERR = require('async-stacktrace');
var _ = require('lodash');
var path = require('path');
var csvStringify = require('csv').stringify;
var express = require('express');
var router = express.Router();

var logger = require('../../logger');
var sqldb = require('../../sqldb');
var sqlLoader = require('../../sql-loader');

var sql = sqlLoader.load(path.join(__dirname, 'adminQuestions.sql'));

router.get('/', function(req, res, next) {
    var params = {
        course_instance_id: res.locals.courseInstanceId,
    };
    sqldb.query(sql.questions, params, function(err, result) {
        if (ERR(err, next)) return;
        res.locals.questions = result.rows;

        var params = {
            course_id: res.locals.course.id,
        };
        sqldb.query(sql.tags, params, function(err, result) {
            if (ERR(err, next)) return;
            res.locals.allTags = result.rows;
        
            var params = {
                course_instance_id: res.locals.courseInstanceId,
            };
            sqldb.query(sql.assessments, params, function(err, result) {
                if (ERR(err, next)) return;
                res.locals.allAssessments = result.rows;
                
                res.render('pages/adminQuestions/adminQuestions', res.locals);
            });
        });
    });
});

module.exports = router;
