var ERR = require('async-stacktrace');
var express = require('express');
var router = express.Router();

var sqldb = require('@prairielearn/prairielib/sql-db');
var sqlLoader = require('@prairielearn/prairielib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const error = require('@prairielearn/prairielib/error');
const logger = require('../../lib/logger');
const { CourseInstanceAddEditor } = require('../../lib/editors');

router.get('/', function(req, res, next) {
    var params = {
        user_id: res.locals.user.user_id,
        is_administrator: res.locals.is_administrator,
        req_date: res.locals.req_date,
        course_id: res.locals.course.id,
    };
    sqldb.query(sql.select_course_instances, params, function(err, result) {
        if (ERR(err, next)) return;
        res.locals.rows = result.rows;
        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    });
});

router.post('/', (req, res, next) => {
    debug(`Responding to post with action ${req.body.__action}`);
    if (req.body.__action == 'add_course_instance') {
        debug(`Responding to action add_course_instance`);
        const editor = new CourseInstanceAddEditor({
            locals: res.locals,
        });
        editor.canEdit((err) => {
            if (ERR(err, next)) return;
            editor.doEdit((err, job_sequence_id) => {
                if (ERR(err, (e) => logger.error(e))) {
                    res.redirect(res.locals.urlPrefix + '/edit_error/' + job_sequence_id);
                } else {
                    debug(`Get course_instance_id from uuid=${editor.uuid} with course_id=${res.locals.course.id}`);
                    sqldb.queryOneRow(sql.select_course_instance_id_from_uuid, {uuid: editor.uuid, course_id: res.locals.course.id}, (err, result) => {
                        if (ERR(err, next)) return;
                        res.redirect(res.locals.plainUrlPrefix + '/course_instance/' + result.rows[0].course_instance_id + '/instructor/instance_admin/settings');
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
