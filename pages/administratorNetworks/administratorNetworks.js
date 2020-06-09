const ERR = require('async-stacktrace');
const _ = require('lodash');
const express = require('express');
const router = express.Router();

const { sqlDb, sqlLoader } = require('@prairielearn/prairielib');

const sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/', (req, res, next) => {
    sqlDb.queryOneRow(sql.select, [], (err, result) => {
        if (ERR(err, next)) return;

        _.assign(res.locals, result.rows[0]);
        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    });
});

module.exports = router;
