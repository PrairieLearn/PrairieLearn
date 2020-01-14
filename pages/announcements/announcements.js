const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();

const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');

const sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/', function(req, res, next) {
    const params = {
        user_id: res.locals.authn_user.user_id,
        course_instance_id: res.locals.course_instance ? res.locals.course_instance.id : null,
        course_id: res.locals.course ? res.locals.course.id : null,
    }
    sqldb.query(sql.select_announcements, params, function(err, result) {
        if (ERR(err, next)) return;
        res.locals.rows = result.rows;

        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    });
});

module.exports = router;
