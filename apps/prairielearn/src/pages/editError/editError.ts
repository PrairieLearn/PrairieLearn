import { Router } from 'express';

import { HttpStatusError } from '@prairielearn/error';
import { logger } from '@prairielearn/logger';

import { pullAndUpdateCourse } from '../../lib/course.js';
import { type EditOutcome, classifyEditOutcome } from '../../lib/editors.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import { getJobSequence } from '../../lib/server-jobs.js';

import { EditError } from './editError.html.js';

const router = Router();

router.get(
  '/:job_sequence_id',
  typedAsyncHandler<'course' | 'course-instance'>(async (req, res) => {
    if (!res.locals.authz_data.has_course_permission_edit) {
      throw new HttpStatusError(403, 'Access denied (must be course editor)');
    }

    const job_sequence_id = req.params.job_sequence_id;
    const jobSequence = await getJobSequence(job_sequence_id, res.locals.course.id);

    if (jobSequence.status === 'Running') {
      // All edits wait for the corresponding job sequence to finish before
      // proceeding, so something bad must have happened to get to this page
      // with a sequence that is still running.
      throw new Error('Edit is still in progress (job sequence is still running)');
    } else if (jobSequence.status !== 'Error') {
      throw new Error('Edit did not fail');
    }

    // Legacy job sequences (which should no longer exist) carry no usable edit
    // flags, so we fall back to the generic failure message for them.
    let outcome: EditOutcome = 'save_failed';

    if (jobSequence.legacy) {
      logger.warn(
        `Found a legacy job sequence (id=${job_sequence_id}) while handling an edit error`,
      );
    } else {
      outcome = classifyEditOutcome(jobSequence.jobs[0].data);
    }

    res.send(EditError({ resLocals: res.locals, jobSequence, outcome }));
  }),
);

router.post(
  '/:job_sequence_id',
  typedAsyncHandler<'course' | 'course-instance'>(async (req, res) => {
    if (!res.locals.authz_data.has_course_permission_edit) {
      throw new HttpStatusError(403, 'Access denied (must be course editor)');
    }

    if (req.body.__action === 'pull') {
      const { jobSequenceId } = await pullAndUpdateCourse({
        course: res.locals.course,
        userId: res.locals.user.id,
        authnUserId: res.locals.authz_data.authn_user.id,
      });
      res.redirect(res.locals.urlPrefix + '/jobSequence/' + jobSequenceId);
    } else {
      throw new HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
