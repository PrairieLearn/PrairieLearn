const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();

const config = require('../../lib/config');
const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');

const sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/:file_id/:display_filename', function(req, res, next) {
    let params = {
        assessment_instance_id: res.locals.assessment_instance.id,
        file_id: req.params.file_id,
        display_filename: req.params.display_filename,
    };
    sqldb.queryZeroOrOneRow(sql.select_file, params, function(err, result) {
        if (ERR(err, next)) return;

        if (result.rows.length < 1) {
            return next(new Error('No such file: ' + req.params.display_filename));
        }

        res.sendFile(result.rows[0].storage_filename, {root: config.filesRoot});
    });
});

module.exports = router;
