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
    sqldb.query(sql.select_submissions, params, (err, result) => {
        if (ERR(err, next)) return;
        res.status(200).send(result.rows);
    });
});

module.exports = router;
