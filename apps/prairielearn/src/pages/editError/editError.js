// @ts-check
const asyncHandler = require('express-async-handler');
import { Router } from 'express';
import { HttpStatusError } from '@prairielearn/error';
import * as serverJobs from '../../lib/server-jobs-legacy';
import * as syncHelpers from '../shared/syncHelpers';
import { logger } from '@prairielearn/logger';

const router = Router();

router.get(
  '/:job_sequence_id',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_permission_edit) {
      throw new HttpStatusError(403, 'Access denied (must be course editor)');
    }

    const job_sequence_id = req.params.job_sequence_id;
    const course_id = res.locals.course ? res.locals.course.id : null;
    const job_sequence = await serverJobs.getJobSequenceWithFormattedOutputAsync(
      job_sequence_id,
      course_id,
    );

    if (job_sequence.status === 'Running') {
      // All edits wait for the corresponding job sequence to finish before
      // proceeding, so something bad must have happened to get to this page
      // with a sequence that is still running.
      throw new Error('Edit is still in progress (job sequence is still running)');
    } else if (job_sequence.status !== 'Error') {
      throw new Error('Edit did not fail');
    }

    res.locals.failedSync = false;

    if (job_sequence.legacy) {
      // Legacy job sequences should no longer exist.
      logger.warn(
        `Found a legacy job sequence (id=${job_sequence_id}) while handling an edit error`,
      );
    } else {
      const job = job_sequence.jobs[0];

      if (job.data.saveSucceeded && !job.data.syncSucceeded) {
        res.locals.failedSync = true;
      }
    }

    res.locals.job_sequence = job_sequence;
    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
  }),
);

router.post(
  '/:job_sequence_id',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_permission_edit) {
      throw new HttpStatusError(403, 'Access denied (must be course editor)');
    }

    if (req.body.__action === 'pull') {
      const job_sequence_id = await syncHelpers.pullAndUpdate(res.locals);
      res.redirect(res.locals.urlPrefix + '/jobSequence/' + job_sequence_id);
    } else {
      throw new HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
