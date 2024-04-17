// @ts-check
import * as express from 'express';
const asyncHandler = require('express-async-handler');
import { z } from 'zod';

import * as error from '@prairielearn/error';
import { regradeAllAssessmentInstances } from '../../lib/regrading';
import * as sqldb from '@prairielearn/postgres';
import { JobSequenceSchema, UserSchema } from '../../lib/db-types';

const router = express.Router();
const sql = sqldb.loadSqlEquiv(__filename);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_instance_permission_view) {
      throw new error.HttpStatusError(403, 'Access denied (must be a student data viewer)');
    }
    res.locals.regrading_job_sequences = await sqldb.queryRows(
      sql.select_regrading_job_sequences,
      { assessment_id: res.locals.assessment.id },
      JobSequenceSchema.extend({
        start_date_formatted: z.string(),
        user_uid: UserSchema.shape.uid,
      }),
    );
    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
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
