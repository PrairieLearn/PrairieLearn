const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();
const error = require('@prairielearn/prairielib/error');
const path = require('path');
const logger = require('../../lib/logger');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');
const sql = sqlLoader.loadSqlEquiv(__filename);
const { QuestionAddEditor } = require('../../lib/editors');

router.get('/', function(req, res, next) {
    const course_instance_id = res.locals.course_instance ? res.locals.course_instance.id : null;
    var params = {
        course_instance_id: course_instance_id,
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
                course_instance_id: course_instance_id,
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
    if (req.body.__action == 'add_question') {
        debug(`Responding to action add_question`);
        const editor = new QuestionAddEditor({
            locals: res.locals,
        });
        editor.canEdit((err) => {
            if (ERR(err, next)) return;
            editor.doEdit((err, job_sequence_id) => {
                if (ERR(err, (e) => logger.error(e))) {
                    res.redirect(res.locals.urlPrefix + '/edit_error/' + job_sequence_id);
                } else {
                    debug(`Get question_id from uuid=${editor.uuid} with course_id=${res.locals.course.id}`);
                    sqldb.queryOneRow(sql.select_question_id_from_uuid, {uuid: editor.uuid, course_id: res.locals.course.id}, (err, result) => {
                        if (ERR(err, next)) return;
                        res.redirect(res.locals.urlPrefix + '/question/' + result.rows[0].question_id + '/settings');
                    });
                }
            });
        });
    } else {
        next(error.make(400, 'unknown __action: ' + req.body.__action, {
            locals: res.locals,
            body: req.body,
        }));
    }
});

module.exports = router;
