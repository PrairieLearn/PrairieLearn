import asyncHandler from 'express-async-handler';

import { run } from '@prairielearn/run';

import { EnrollmentPage } from '../components/EnrollmentPage.js';
import { hasRole } from '../lib/authz-data-lib.js';
import type { CourseInstance } from '../lib/db-types.js';
import { checkEnrollmentEligibility } from '../lib/enrollment-eligibility.js';
import { idsEqual } from '../lib/id.js';
import { ensureEnrollment, selectOptionalEnrollmentByUid } from '../models/enrollment.js';

export default asyncHandler(async (req, res, next) => {
  // If the user does not currently have access to the course, but could if
  // they were enrolled, automatically enroll them. However, we will not
  // attempt to enroll them if they are an instructor (that is, if they have
  // a specific role in the course or course instance) or if they are
  // impersonating another user.

  // TODO: check if self-enrollment requires a secret link.

  const courseInstance: CourseInstance = res.locals.course_instance;

  // We select by user UID so that we can find invited/rejected enrollments as well
  const existingEnrollment = await run(async () => {
    // We only want to even try to lookup enrollment information if the user is a student.
    if (!hasRole(res.locals.authz_data, ['Student'])) {
      return null;
    }
    return await selectOptionalEnrollmentByUid({
      uid: res.locals.authn_user.uid,
      courseInstance,
      requiredRole: ['Student'],
      authzData: res.locals.authz_data,
    });
  });

  const enrollmentEligibility = checkEnrollmentEligibility({
    user: res.locals.authn_user,
    course: res.locals.course,
    courseInstance,
    existingEnrollment,
  });

  // If the user is not enrolled, or is rejected/left/removed then they can enroll if self-enrollment is allowed.
  const canSelfEnroll =
    enrollmentEligibility.eligible &&
    (existingEnrollment == null ||
      ['rejected', 'left', 'removed'].includes(existingEnrollment.status));

  // If the user is enrolled and is invited/joined, then they have access regardless of the self-enrollment status.
  const canAccessCourseInstance =
    existingEnrollment != null && ['invited', 'joined'].includes(existingEnrollment.status);

  if (
    idsEqual(res.locals.user.id, res.locals.authn_user.id) &&
    res.locals.authz_data.authn_course_role === 'None' &&
    res.locals.authz_data.authn_course_instance_role === 'None' &&
    res.locals.authz_data.authn_has_student_access &&
    !res.locals.authz_data.authn_has_student_access_with_enrollment
  ) {
    if (canSelfEnroll || canAccessCourseInstance) {
      await ensureEnrollment({
        institution: res.locals.institution,
        course: res.locals.course,
        courseInstance,
        authzData: res.locals.authz_data,
        requiredRole: ['Student'],
        actionDetail: 'implicit_joined',
      });

      // This is the only part of the `authz_data` that would change as a
      // result of this enrollment, so we can just update it directly.
      res.locals.authz_data.has_student_access_with_enrollment = true;
    } else if (!enrollmentEligibility.eligible) {
      res
        .status(403)
        .send(EnrollmentPage({ resLocals: res.locals, type: enrollmentEligibility.reason }));
      return;
    }
  }

  next();
});
