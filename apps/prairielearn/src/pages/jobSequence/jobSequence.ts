import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { HttpStatusError } from '@prairielearn/error';

import { getJobSequence } from '../../lib/server-jobs.js';

import { JobSequence } from './jobSequence.html.js';

const router = Router();

router.get(
  '/:job_sequence_id',
  asyncHandler(async (req, res) => {
    const job_sequence_id = req.params.job_sequence_id;
    const course_id = res.locals.course?.id ?? null;
    const job_sequence = await getJobSequence(job_sequence_id, course_id);

    // Verify existence of authz_data, which means that we are accessing the job
    // sequence through a course or a course instance. If authz_data does not
    // exist, we are either in administrator mode or in dev mode.
    if (res.locals.authz_data) {
      // Some job sequences show information that should only be available to
      // users who can view code (Course role: Viewer) or who can view student
      // data (Course instance role: Student Data Viewer).

      if (job_sequence.course_instance_id == null) {
        // If course_instance_id is null, then this job_sequence likely has
        // something to do with code.

        if (!res.locals.authz_data.has_course_permission_view) {
          throw new HttpStatusError(403, 'Access denied (must be a Viewer in the course)');
        }
      } else {
        // If course_instance_id is not null, then this job sequence likely
        // has something to do with student data.

        if (!res.locals.course_instance) {
          // The user is trying to access a job sequence that is associated with
          // a course instance through a course page route. Redirect to the course
          // instance page route so we get authz_data for the course instance.
          res.redirect(
            `/pl/course_instance/${job_sequence.course_instance_id}/instructor/jobSequence/${job_sequence.id}`,
          );
        }

        if (!res.locals.authz_data.has_course_instance_permission_view) {
          throw new HttpStatusError(
            403,
            'Access denied (must be a Student Data Viewer in the course instance)',
          );
        }
      }
    }

    let referrer =
      typeof req.query.referrer === 'string' ? req.query.referrer : req.get('Referrer') || null;
    if (referrer) {
      // Validate that the referrer is an HTTP or HTTPS URL. We don't validate
      // the host because the server may be running behind a reverse proxy that
      // changes the host, and we just want to ensure that it's a safe URL to
      // redirect to.
      try {
        const referrerUrl = new URL(referrer);
        if (referrerUrl.protocol !== 'http:' && referrerUrl.protocol !== 'https:') {
          referrer = null;
        }
      } catch {
        referrer = null;
      }
    }
    res.send(JobSequence({ resLocals: res.locals, job_sequence, referrer }));
  }),
);

export default router;
