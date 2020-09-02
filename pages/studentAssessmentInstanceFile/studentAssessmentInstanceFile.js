// const ERR = require('async-stacktrace');
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

    // NOTE: Might want to remove SQL file

    const stream = await fileStore.get(options.assessment_instance_id, options.file_id, options.display_filename);

    // Explore error handling?
    stream.pipe(res);
        // if (result.rows[0].storage_type === fileStore.storageTypes.S3) {
        //     const stream = await fileStore.get(result.rows[0].storage_filename, fileStore.storageTypes.S3);
        //     res.sendFile(result.rows[0].storage_filename, stream);
        //     // stream.pipe(res);
        // } else {
        //     res.sendFile(result.rows[0].storage_filename, {root: config.filesRoot});
        // }

});

module.exports = router;
