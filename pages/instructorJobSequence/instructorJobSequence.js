var ERR = require('async-stacktrace');
var express = require('express');
var router = express.Router();

var sqldb = require('@prairielearn/prairielib/sql-db');
var sqlLoader = require('@prairielearn/prairielib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/:job_sequence_id', function(req, res, next) {
    var params = {
        job_sequence_id: req.params.job_sequence_id,
        course_id: res.locals.course ? res.locals.course.id : null,
    };
    sqldb.queryOneRow(sql.select_job_sequence, params, function(err, result) {
        if (ERR(err, next)) return;
        res.locals.job_sequence = result.rows[0];

        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    });
});

module.exports = router;
