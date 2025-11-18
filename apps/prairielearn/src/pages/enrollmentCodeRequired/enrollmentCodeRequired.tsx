import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { Hydrate } from '@prairielearn/preact/server';
import { run } from '@prairielearn/run';

import { EnrollmentPage } from '../../components/EnrollmentPage.js';
import { PageLayout } from '../../components/PageLayout.js';
import { hasRole } from '../../lib/authz-data-lib.js';
import { extractPageContext } from '../../lib/client/page-context.js';
import { authzCourseOrInstance } from '../../middlewares/authzCourseOrInstance.js';
import { ensureCheckedEnrollment, selectOptionalEnrollmentByUid } from '../../models/enrollment.js';

import { EnrollmentCodeRequired } from './enrollmentCodeRequired.html.js';

const router = Router();

router.get(
  '/:code?',
  asyncHandler(async (req, res) => {
    const code = req.params.code as string | undefined;
    // If they were redirected here, it will have a url param named `url`.
    const { url } = req.query;

    const { course_instance: courseInstance } = extractPageContext(res.locals, {
      pageType: 'courseInstance',
      // We should be careful to not pass `courseInstance` to the hydrated page.
      accessType: 'instructor',
    });
    const enrollmentCode = courseInstance.enrollment_code;
    const redirectUrl =
      typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') ? url : null;
    // Lookup if they have an existing enrollment
    const existingEnrollment = await run(async () => {
      // We don't want to 403 instructors
      if (!hasRole(res.locals.authz_data, 'Student')) return null;
      return await selectOptionalEnrollmentByUid({
        uid: res.locals.authn_user.uid,
        courseInstance,
        requestedRole: 'Student',
        authzData: res.locals.authz_data,
      });
    });

    const selfEnrollmentEnabled = courseInstance.self_enrollment_enabled;

    const institutionRestrictionSatisfied =
      !courseInstance.self_enrollment_restrict_to_institution ||
      res.locals.authn_user.institution_id === res.locals.course.institution_id;

    const selfEnrollmentExpired =
      courseInstance.self_enrollment_enabled_before_date != null &&
      new Date() >= courseInstance.self_enrollment_enabled_before_date;

    if (!selfEnrollmentEnabled && !existingEnrollment) {
      res
        .status(403)
        .send(EnrollmentPage({ resLocals: res.locals, type: 'self-enrollment-disabled' }));
      return;
    }

    if (selfEnrollmentExpired && !existingEnrollment) {
      res
        .status(403)
        .send(EnrollmentPage({ resLocals: res.locals, type: 'self-enrollment-expired' }));
      return;
    }

    if (!institutionRestrictionSatisfied && !existingEnrollment) {
      res
        .status(403)
        .send(EnrollmentPage({ resLocals: res.locals, type: 'institution-restriction' }));
      return;
    }

    const canJoin =
      existingEnrollment != null &&
      ['joined', 'invited', 'rejected', 'removed'].includes(existingEnrollment.status);

    if (existingEnrollment && !canJoin) {
      res.status(403).send(EnrollmentPage({ resLocals: res.locals, type: 'blocked' }));
      return;
    }

    if (
      // No enrollment code required
      !courseInstance.self_enrollment_use_enrollment_code ||
      // Enrollment code is correct
      code?.toUpperCase() === enrollmentCode.toUpperCase() ||
      // Existing enrollments can transition immediately
      existingEnrollment
    ) {
      if (code?.toUpperCase() === enrollmentCode.toUpperCase() || canJoin) {
        // Authorize the user for the course instance
        req.params.course_instance_id = courseInstance.id;
        await authzCourseOrInstance(req, res);

        // Enroll the user
        await ensureCheckedEnrollment({
          institution: res.locals.institution,
          course: res.locals.course,
          courseInstance: res.locals.course_instance,
          authzData: res.locals.authz_data,
          requestedRole: 'Student',
          actionDetail: 'implicit_joined',
        });
      }

      // redirect to a different page, which will have proper authorization.
      if (redirectUrl != null) {
        res.redirect(redirectUrl);
      } else {
        res.redirect(`/pl/course_instance/${courseInstance.id}/assessments`);
      }
      return;
    }

    res.send(
      PageLayout({
        resLocals: res.locals,
        pageTitle: 'Enrollment Code Required',
        navContext: {
          type: 'student',
          page: 'enroll',
        },
        content: (
          <Hydrate>
            <EnrollmentCodeRequired courseInstanceId={courseInstance.id} />
          </Hydrate>
        ),
      }),
    );
  }),
);

export default router;
