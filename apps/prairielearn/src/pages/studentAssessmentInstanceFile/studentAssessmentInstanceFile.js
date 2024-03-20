//@ts-check
const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');

const error = require('@prairielearn/error');
const sqldb = require('@prairielearn/postgres');
const fileStore = require('../../lib/file-store');

const sql = sqldb.loadSqlEquiv(__filename);

router.get(
  '/:unsafe_file_id/:unsafe_display_filename',
  asyncHandler(async (req, res, next) => {
    const params = {
      assessment_instance_id: res.locals.assessment_instance.id,
      unsafe_file_id: req.params.unsafe_file_id,
      unsafe_display_filename: req.params.unsafe_display_filename,
    };

    // Assert that the file belongs to this assessment, that the display
    // filename matches, and that the file is not deleted.
    const result = await sqldb.queryZeroOrOneRowAsync(sql.select_file, params);
    if (result.rows.length === 0) {
      return next(error.make(404, 'File not found'));
    }

    const { id: fileId, display_filename: displayFilename } = result.rows[0];
    const stream = await fileStore.getStream(fileId);
    // Ensure the response is interpreted as an "attachment" (file to be downloaded)
    // and not as a webpage.
    res.attachment(displayFilename);
    stream.on('error', next).pipe(res);
  }),
);

module.exports = router;
