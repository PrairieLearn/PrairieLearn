import asyncHandler from 'express-async-handler';

import { run } from '@prairielearn/run';

import { EnrollmentPage } from '../components/EnrollmentPage.js';
import { hasRole } from '../lib/authz-data-lib.js';
import type { CourseInstance } from '../lib/db-types.js';
import { features } from '../lib/features/index.js';
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

  const enrollmentManagementEnabled = await features.enabledFromLocals(
    'enrollment-management',
    res.locals,
  );

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

  // Check if the self-enrollment institution restriction is satisfied
  const institutionRestrictionSatisfied =
    res.locals.authn_user.institution_id === res.locals.course.institution_id ||
    !enrollmentManagementEnabled ||
    // The default value for self-enrollment restriction is true.
    // In the old system (before publishing was introduced), the default was false.
    // So if publishing is not set up, we should ignore the restriction.
    !courseInstance.modern_publishing ||
    !courseInstance.self_enrollment_restrict_to_institution;

  // If we have self-enrollment enabled, and it is before the enabled before date,
  // and the institution restriction is satisfied, then we can enroll the user.
  const selfEnrollmentEnabled = courseInstance.self_enrollment_enabled;
  const selfEnrollmentExpired =
    courseInstance.self_enrollment_enabled_before_date != null &&
    new Date() >= courseInstance.self_enrollment_enabled_before_date;
  const selfEnrollmentAllowed =
    selfEnrollmentEnabled && !selfEnrollmentExpired && institutionRestrictionSatisfied;

  // If the user is not enrolled or has been rejected then they can enroll if self-enrollment is allowed.
  const canSelfEnroll =
    selfEnrollmentAllowed &&
    (existingEnrollment == null || ['rejected'].includes(existingEnrollment.status));

  // If the user is enrolled and is invited/joined/removed, then they have access regardless of the self-enrollment status.
  const canAccessCourseInstance =
    existingEnrollment != null &&
    ['invited', 'joined', 'removed'].includes(existingEnrollment.status);

  if (
    idsEqual(res.locals.user.user_id, res.locals.authn_user.user_id) &&
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
    } else if (existingEnrollment) {
      res.status(403).send(EnrollmentPage({ resLocals: res.locals, type: 'blocked' }));
      return;
    } else if (selfEnrollmentExpired) {
      res
        .status(403)
        .send(EnrollmentPage({ resLocals: res.locals, type: 'self-enrollment-expired' }));
      return;
    } else if (!selfEnrollmentEnabled) {
      res
        .status(403)
        .send(EnrollmentPage({ resLocals: res.locals, type: 'self-enrollment-disabled' }));
      return;
    } else if (!institutionRestrictionSatisfied) {
      res
        .status(403)
        .send(EnrollmentPage({ resLocals: res.locals, type: 'institution-restriction' }));
      return;
    } else {
      // No fancy error page
    }
  }

  next();
});
