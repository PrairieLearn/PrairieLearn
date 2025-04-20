import * as express from 'express';
import asyncHandler from 'express-async-handler';

import * as error from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';

import { regradeAllAssessmentInstances } from '../../lib/regrading.js';

import {
  InstructorAssessmentRegrading,
  RegradingJobSequenceSchema,
} from './instructorAssessmentRegrading.html.js';

const router = express.Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_instance_permission_view) {
      throw new error.HttpStatusError(403, 'Access denied (must be a student data viewer)');
    }
    const regradingJobSequences = await sqldb.queryRows(
      sql.select_regrading_job_sequences,
      { assessment_id: res.locals.assessment.id },
      RegradingJobSequenceSchema,
    );
    res.send(InstructorAssessmentRegrading({ resLocals: res.locals, regradingJobSequences }));
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_instance_permission_edit) {
      throw new error.HttpStatusError(403, 'Access denied (must be a student data editor)');
    }

    if (req.body.__action === 'regrade_all') {
      const job_sequence_id = await regradeAllAssessmentInstances(
        res.locals.assessment.id,
        res.locals.user.user_id,
        res.locals.authn_user.user_id,
      );
      res.redirect(res.locals.urlPrefix + '/jobSequence/' + job_sequence_id);
    } else {
      throw new error.HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
