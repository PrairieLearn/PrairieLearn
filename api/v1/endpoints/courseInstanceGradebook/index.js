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
        course_instance_id: req.params.course_instance_id,
    };
    sqldb.query(sql.select_user_scores, params, (err, result) => {
        if (ERR(err, next)) return;
        res.send(result.rows);
    });
});

module.exports = router;
