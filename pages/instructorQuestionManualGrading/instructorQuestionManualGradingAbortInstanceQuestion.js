const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const error = require('@prairielearn/prairielib/error');
const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');

const sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/', function(req, res, next) {
    debug('GET /');
    const params = {
        instance_question_id: res.locals.instance_question_id,
    };
    const url = `${res.locals.urlPrefix}/course_instance/${res.locals.course_instance_id}/instructor/assessment/${res.locals.assessment_id}/manual_grading`;

    sqldb.queryOneRow(sql.instance_question_abort_manual_grading, params, function(err, result) {
        if (ERR(err, next)) return next(error.make(500, `Cannot find instance question: ${res.locals.instance_question_id}`));
        if (result.rowCount > 0) { res.redirect(url); }
    });
});

module.exports = router;
