var ERR = require('async-stacktrace');
var express = require('express');
var router = express.Router();

var sqldb = require('@prairielearn/prairielib/sql-db');
var sqlLoader = require('@prairielearn/prairielib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/', function(req, res, next) {
    var params = {
        course_id: res.locals.course.id,
    };
    sqldb.query(sql.course_instance_list, params, function(err, result) {
        if (ERR(err, next)) return;
        res.locals.course_instance_list = result.rows;
        
        var params = {
            course_id: res.locals.course.id,
        };
        sqldb.query(sql.questions, params, function(err, result) {
            if (ERR(err, next)) return;
            res.locals.questions = result.rows;
    
            var params = {
                course_id: res.locals.course.id,
            };
            sqldb.query(sql.tags, params, function(err, result) {
                if (ERR(err, next)) return;
                res.locals.all_tags = result.rows;
            
                res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
            });
        });
    });
});

module.exports = router;
