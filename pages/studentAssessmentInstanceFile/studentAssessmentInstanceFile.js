const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');

const fileStore = require('../../lib/file-store');

router.get(
  '/:file_id/:display_filename',
  asyncHandler(async (req, res, next) => {
    const options = {
      assessment_instance_id: res.locals.assessment_instance.id,
      file_id: req.params.file_id,
      display_filename: req.params.display_filename,
    };

    const stream = await fileStore.getStream(options.file_id);
    stream.on('error', next).pipe(res);
  })
);

module.exports = router;
