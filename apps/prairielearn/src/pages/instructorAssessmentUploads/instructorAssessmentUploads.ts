import * as express from 'express';
import asyncHandler from 'express-async-handler';

import * as error from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';

import {
  uploadInstanceQuestionScores,
  uploadAssessmentInstanceScores,
} from '../../lib/score-upload.js';

import {
  InstructorAssessmentUploads,
  UploadJobSequenceSchema,
} from './instructorAssessmentUploads.html.js';

const router = express.Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_instance_permission_view) {
      throw new error.HttpStatusError(403, 'Access denied (must be a student data viewer)');
    }
    const uploadJobSequences = await sqldb.queryRows(
      sql.select_upload_job_sequences,
      { assessment_id: res.locals.assessment.id },
      UploadJobSequenceSchema,
    );
    res.send(InstructorAssessmentUploads({ resLocals: res.locals, uploadJobSequences }));
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_instance_permission_edit) {
      throw new error.HttpStatusError(403, 'Access denied (must be a student data editor)');
    }

    if (req.body.__action === 'upload_instance_question_scores') {
      const jobSequenceId = await uploadInstanceQuestionScores(
        res.locals.assessment.id,
        req.file,
        res.locals.user.user_id,
        res.locals.authn_user.user_id,
      );
      res.redirect(res.locals.urlPrefix + '/jobSequence/' + jobSequenceId);
    } else if (req.body.__action === 'upload_assessment_instance_scores') {
      const jobSequenceId = await uploadAssessmentInstanceScores(
        res.locals.assessment.id,
        req.file,
        res.locals.user.user_id,
        res.locals.authn_user.user_id,
      );
      res.redirect(res.locals.urlPrefix + '/jobSequence/' + jobSequenceId);
    } else {
      throw new error.HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
