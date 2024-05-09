// @ts-check
import { Router } from 'express';
const asyncHandler = require('express-async-handler');

import * as error from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';
import * as fileStore from '../../lib/file-store';

const sql = sqldb.loadSqlEquiv(__filename);
const router = Router();

router.get(
  '/:unsafe_file_id(\\d+)/:unsafe_display_filename',
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
      throw new error.HttpStatusError(404, 'File not found');
    }

    const { id: fileId, display_filename: displayFilename } = result.rows[0];
    const stream = await fileStore.getStream(fileId);
    // Ensure the response is interpreted as an "attachment" (file to be downloaded)
    // and not as a webpage.
    res.attachment(displayFilename);
    stream.on('error', next).pipe(res);
  }),
);

export default router;
