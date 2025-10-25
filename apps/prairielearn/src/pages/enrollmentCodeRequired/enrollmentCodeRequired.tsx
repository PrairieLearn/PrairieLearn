import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { Hydrate } from '@prairielearn/preact/server';

import { PageLayout } from '../../components/PageLayout.js';
import { getCourseInstanceContext } from '../../lib/client/page-context.js';
import { authzCourseOrInstance } from '../../middlewares/authzCourseOrInstance.js';
import {
  ensureCheckedEnrollment,
  selectOptionalEnrollmentByUserId,
} from '../../models/enrollment.js';

import { EnrollmentCodeRequired } from './enrollmentCodeRequired.html.js';

const router = Router();

router.get(
  '/:code?',
  asyncHandler(async (req, res) => {
    const code = req.params.code as string | undefined;
    // If they were redirected here, it will have a url param named `url`.
    const { url } = req.query;

    const { course_instance: courseInstance } = getCourseInstanceContext(res.locals, 'instructor');
    const enrollmentCode = courseInstance.enrollment_code;
    const redirectUrl =
      typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') ? url : null;
    // Lookup if they have an existing enrollment
    const existingEnrollment = await selectOptionalEnrollmentByUserId({
      userId: res.locals.authn_user.user_id,
      courseInstance,
      requestedRole: 'Student',
      authzData: res.locals.authz_data,
    });

    if (
      // No self-enrollment enabled
      !courseInstance.self_enrollment_enabled ||
      // No enrollment code required
      !courseInstance.self_enrollment_use_enrollment_code ||
      // Enrollment code is correct
      code?.toUpperCase() === enrollmentCode.toUpperCase() ||
      // Existing enrollments can transition immediately
      existingEnrollment
    ) {
      // 'blocked' and 'joined' enrollments don't transition.
      // This means that blocked users will end up on the /assessments page without authorization.

      if (
        code?.toUpperCase() === enrollmentCode.toUpperCase() ||
        (existingEnrollment &&
          ['invited', 'rejected', 'removed'].includes(existingEnrollment.status))
      ) {
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
