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
        assessment_id: req.params.assessment_id,
        assessment_instance_id: req.params.assessment_instance_id,
    };
    sqldb.query(sql.select_assessment_instances, params, (err, result) => {
        if (ERR(err, next)) return;
        res.status(200).send(result.rows);
    });
});

module.exports = router;