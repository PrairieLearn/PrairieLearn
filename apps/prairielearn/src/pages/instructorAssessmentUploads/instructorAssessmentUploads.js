// @ts-check
import asyncHandler from 'express-async-handler';
import * as express from 'express';
import * as error from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';
import { z } from 'zod';

import {
  uploadInstanceQuestionScores,
  uploadAssessmentInstanceScores,
} from '../../lib/score-upload.js';
import { JobSequenceSchema, UserSchema } from '../../lib/db-types.js';

const router = express.Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_instance_permission_view) {
      throw new error.HttpStatusError(403, 'Access denied (must be a student data viewer)');
    }
    res.locals.upload_job_sequences = await sqldb.queryRows(
      sql.select_upload_job_sequences,
      { assessment_id: res.locals.assessment.id },
      JobSequenceSchema.extend({
        start_date_formatted: z.string(),
        user_uid: UserSchema.shape.uid,
      }),
    );
    res.render(import.meta.filename.replace(/\.js$/, '.ejs'), res.locals);
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
