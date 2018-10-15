const ERR = require('async-stacktrace');
const path = require('path');
const express = require('express');
const router = express.Router({
    mergeParams: true,
});

const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');

const sql = sqlLoader.load(path.join(__dirname, '..', 'queries.sql'));

router.get('/:assessment_instance_id', (req, res, next) => {
    const params = {
        course_instance_id: req.params.course_instance_id,
        assessment_id: null,
        assessment_instance_id: req.params.assessment_instance_id,
    };
    sqldb.queryZeroOrOneRow(sql.select_assessment_instances, params, (err, result) => {
        if (ERR(err, next)) return;
        if (result.length === 0) {
            res.status(404).send({
                message: 'Not Found',
            });
        } else {
            res.status(200).send(result.rows[0]);
        }
    });
});

router.get('/:assessment_instance_id/submissions', (req, res, next) => {
    const params = {
        course_instance_id: req.params.course_instance_id,
        assessment_instance_id: req.params.assessment_instance_id,
        submission_id: null,
    };
    sqldb.query(sql.select_submissions, params, (err, result) => {
        if (ERR(err, next)) return;
        res.status(200).send(result.rows);
    });
});

module.exports = router;
