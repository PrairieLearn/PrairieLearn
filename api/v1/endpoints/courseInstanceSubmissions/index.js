const ERR = require('async-stacktrace');
const path = require('path');
const express = require('express');
const router = express.Router({
    mergeParams: true,
});

const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');

const sql = sqlLoader.load(path.join(__dirname, '..', 'queries.sql'));

router.get('/:submission_id', (req, res, next) => {
    const params = {
        course_instance_id: req.params.course_instance_id,
        assessment_instance_id: null,
        submission_id: req.params.submission_id,
    };
    sqldb.queryOneRow(sql.select_submissions, params, (err, result) => {
        if (ERR(err, next)) return;
        const data = result.rows[0].item;
        if (data.length === 0) {
            res.status(404).send({
                message: 'Not Found',
            });
        } else {
            res.status(200).send(data[0]);
        }
    });
});

module.exports = router;
