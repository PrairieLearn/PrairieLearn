import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { HttpStatusError } from '@prairielearn/error';
import { loadSqlEquiv, queryOptionalRow } from '@prairielearn/postgres';

import { FileSchema } from '../../lib/db-types.js';
import * as fileStore from '../../lib/file-store.js';
import clientFingerprint from '../../middlewares/clientFingerprint.js';
import logPageView from '../../middlewares/logPageView.js';
import selectAndAuthzAssessmentInstance from '../../middlewares/selectAndAuthzAssessmentInstance.js';
import studentAssessmentAccess from '../../middlewares/studentAssessmentAccess.js';

const sql = loadSqlEquiv(import.meta.url);
const router = Router({ mergeParams: true });

router.use(selectAndAuthzAssessmentInstance);
router.use(studentAssessmentAccess);
router.use(clientFingerprint);
router.use(logPageView('studentAssessmentInstanceFile'));

router.get(
  '/:unsafe_file_id(\\d+)/:unsafe_display_filename',
  asyncHandler(async (req, res, next) => {
    // Assert that the file belongs to this assessment, that the display
    // filename matches, and that the file is not deleted.
    const file = await queryOptionalRow(
      sql.select_file,
      {
        assessment_instance_id: res.locals.assessment_instance.id,
        unsafe_file_id: req.params.unsafe_file_id,
        unsafe_display_filename: req.params.unsafe_display_filename,
      },
      FileSchema,
    );
    if (file == null) {
      throw new HttpStatusError(404, 'File not found');
    }
    if (file.type === 'student_upload' && !res.locals.assessment.allow_personal_notes) {
      throw new HttpStatusError(403, 'Assessment does not allow access to personal notes');
    }

    const stream = await fileStore.getStream(file.id);
    // Ensure the response is interpreted as an "attachment" (file to be downloaded)
    // and not as a webpage.
    res.attachment(file.display_filename);
    stream.on('error', next).pipe(res);
  }),
);

export default router;
