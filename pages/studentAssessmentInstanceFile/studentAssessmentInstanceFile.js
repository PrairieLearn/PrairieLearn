// const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();
const fileStore = require('../../lib/file-store');

router.get('/:file_id/:display_filename', async function(req, res) {
    const options = {
        assessment_instance_id: res.locals.assessment_instance.id,
        file_id: req.params.file_id,
        display_filename: req.params.display_filename,
    };

    const file = await fileStore.get(options.file_id);
    res.set('Content-Type', 'application/octet-stream');
    res.set('Content-disposition', `attachment; filename=${options.display_filename}`);
    res.send(file.contents);
});

module.exports = router;
