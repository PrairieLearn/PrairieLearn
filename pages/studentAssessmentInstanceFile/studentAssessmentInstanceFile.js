const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();
const fileStore = require('../../lib/file-store');

// const config = require('../../lib/config');
// const sqldb = require('@prairielearn/prairielib/sql-db');
// const sqlLoader = require('@prairielearn/prairielib/sql-loader');

// const sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/:file_id/:display_filename', async function(req, res, next) {
    const options = {
        assessment_instance_id: res.locals.assessment_instance.id,
        file_id: req.params.file_id,
        display_filename: req.params.display_filename,
    };

    const stream = await fileStore.get(options.file_id, options.assessment_instance_id, options.display_filename);
    stream
        .on('error', (err) => {return ERR(err, next);})
        .pipe(res);
});

module.exports = router;
