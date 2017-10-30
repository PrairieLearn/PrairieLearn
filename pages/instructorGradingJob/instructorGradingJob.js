var ERR = require('async-stacktrace');
var _ = require('lodash');
var express = require('express');
var router = express.Router();

var sqldb = require('../../lib/sqldb');
var sqlLoader = require('../../lib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/:job_id', (req, res, next) => {
    const params = {
        job_id: req.params.job_id,
        course_instance_id: res.locals.course_instance.id,
    };
    sqldb.queryOneRow(sql.select_job, params, (err, result) => {
        if (ERR(err, next)) return;

        _.assign(res.locals, result.rows[0]);
        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    });
});

module.exports = router;
