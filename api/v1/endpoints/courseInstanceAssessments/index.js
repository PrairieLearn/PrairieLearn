const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router({
    mergeParams: true,
});

const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');

const sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/', (req, res, next) => {
    const params = {
        course_instance_id: res.locals.course_instance.id,
        authz_data: res.locals.authz_data,
        req_date: res.locals.req_date,
        assessment_id: null,
    };
    sqldb.query(sql.select_assessments, params, (err, result) => {
        if (ERR(err, next)) return;
        res.status(200).send(result.rows);
    });
});

router.get('/:assessment_id', (req, res, next) => {
    const params = {
        course_instance_id: res.locals.course_instance.id,
        authz_data: res.locals.authz_data,
        req_date: res.locals.req_date,
        assessment_id: req.params.assessment_id,
    };
    sqldb.queryZeroOrOneRow(sql.select_assessments, params, (err, result) => {
        if (ERR(err, next)) return;
        if (result.rows.length === 0) {
            res.status(404).send({
                message: 'Not Found',
            });
        } else {
            res.status(200).send(result.rows[0]);
        }
    });
});

module.exports = router;