import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { HttpStatusError } from '@prairielearn/error';
import { logger } from '@prairielearn/logger';

import { getJobSequence } from '../../lib/server-jobs.js';
import * as syncHelpers from '../shared/syncHelpers.js';

import { EditError } from './editError.html.js';

const router = Router();

console.log('In editError.ts'); // TEST

router.use((req, res, next) => {
  console.log('In editErrorRouter middleware'); // TEST
  console.log(`Request Path: ${req.path}`); // Log the request path
  console.log(`Request Method: ${req.method}`); // Log the request method
  next();
});

router.get(
  '/:job_sequence_id',
  asyncHandler(async (req, res) => {
    console.log('In editError.ts GET'); // TEST
    if (!res.locals.authz_data.has_course_permission_edit) {
      throw new HttpStatusError(403, 'Access denied (must be course editor)');
    }

    const job_sequence_id = req.params.job_sequence_id;
    const course_id = res.locals.course?.id ?? null;
    const jobSequence = await getJobSequence(job_sequence_id, course_id);

    if (jobSequence.status === 'Running') {
      throw new Error('Edit is still in progress (job sequence is still running)');
    } else if (jobSequence.status !== 'Error') {
      throw new Error('Edit did not fail');
    }

    let failedSync = false;

    if (jobSequence.legacy) {
      logger.warn(
        `Found a legacy job sequence (id=${job_sequence_id}) while handling an edit error`,
      );
    } else {
      const job = jobSequence.jobs[0];

      if (job.data.saveSucceeded && !job.data.syncSucceeded) {
        failedSync = true;
      }
    }

    res.send(EditError({ resLocals: res.locals, jobSequence, failedSync }));
  }),
);

router.post(
  '/:job_sequence_id',
  asyncHandler(async (req, res) => {
    console.log('In editError.ts POST'); // TEST
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

// Catch-all route for debugging
router.use((req, res) => {
  console.log('Unmatched request in editErrorRouter');
  res.status(404).send('Not Found');
});

export default router;