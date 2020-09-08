const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();
const fileStore = require('../../lib/file-store');

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
