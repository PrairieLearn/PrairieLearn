import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { HttpStatusError } from '@prairielearn/error';
import { run } from '@prairielearn/run';

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

    const referrer = run(() => {
      // Only accept a referrer query parameter if it's parseable and is a
      // relative path, to prevent open redirect vulnerabilities.
      if (typeof req.query.referrer === 'string') {
        const base = 'https://placeholder.invalid';
        const resolved = URL.parse(req.query.referrer, base);
        if (resolved?.origin === base) {
          return resolved.pathname + resolved.search;
        }
        return null;
      }
      // If the referrer query parameter is not present, fall back to the
      // Referrer header.
      const referrerHeader = req.get('Referrer');
      if (!referrerHeader) return null;
      const referrerUrl = URL.parse(referrerHeader);
      // Block referrers using non-http(s) protocols for security reasons. To
      // avoid problems with reverse proxy setups, we only check the protocol of
      // the referrer URL and not the origin. If the URL is null (i.e., it
      // couldn't be parsed), then we ignore it and return null.
      if (referrerUrl?.protocol === 'http:' || referrerUrl?.protocol === 'https:') {
        return referrerHeader;
      }
      return null;
    });
    res.send(JobSequence({ resLocals: res.locals, job_sequence, referrer }));
  }),
);

export default router;
