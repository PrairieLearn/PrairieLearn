var ERR = require('async-stacktrace');
var express = require('express');
var router = express.Router();
const error = require('@prairielearn/prairielib/error');
const debug = require('debug')('prairielearn:instructorQuestions');

var sqldb = require('@prairielearn/prairielib/sql-db');
var sqlLoader = require('@prairielearn/prairielib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/', function(req, res, next) {
    var params = {
        course_instance_id: res.locals.course_instance.id,
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

            var params = {
                course_instance_id: res.locals.course_instance.id,
            };
            sqldb.query(sql.assessments, params, function(err, result) {
                if (ERR(err, next)) return;
                res.locals.all_assessments = result.rows;

                res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
            });
        });
    });
});

router.post('/', (req, res, next) => {
    debug(`Responding to post with action ${req.body.__action}`);
    if (!res.locals.authz_data.has_course_permission_edit) return next(new Error('Insufficient permissions'));

    // Do not allow users to edit the exampleCourse
    if (res.locals.course.options.isExampleCourse) {
        return next(error.make(400, `attempting to add question to example course`, {
            locals: res.locals,
            body: req.body,
        }));
    }

    if (req.body.__action == 'questions_insert') {
        debug(`Add question\n title: ${req.body.questions_insert_title}\n id: ${req.body.questions_insert_id}`);
        res.redirect(req.originalUrl);
    } else {
        next(error.make(400, 'unknown __action: ' + req.body.__action, {
            locals: res.locals,
            body: req.body,
        }));
    }
});

module.exports = router;
