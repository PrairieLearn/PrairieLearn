import asyncHandler from 'express-async-handler';

import { run } from '@prairielearn/run';

import { hasRole } from '../lib/authzData.js';
import type { CourseInstance } from '../lib/db-types.js';
import { idsEqual } from '../lib/id.js';
import { ensureCheckedEnrollment, selectOptionalEnrollmentByUid } from '../models/enrollment.js';

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
    if (!hasRole(res.locals.authz_data, 'Student')) {
      return null;
    }
    return await selectOptionalEnrollmentByUid({
      uid: res.locals.authn_user.uid,
      courseInstance,
      requestedRole: 'Student',
      authzData: res.locals.authz_data,
    });
  });

  // Check if the self-enrollment institution restriction is satisfied
  const institutionRestrictionSatisfied =
    !courseInstance.self_enrollment_restrict_to_institution ||
    res.locals.authn_user.institution_id === res.locals.course.institution_id;

  // If we have self-enrollment enabled, and it is before the enabled before date,
  // and the institution restriction is satisfied, then we can enroll the user.
  const selfEnrollmentAllowed =
    courseInstance.self_enrollment_enabled &&
    (courseInstance.self_enrollment_enabled_before_date == null ||
      new Date() < courseInstance.self_enrollment_enabled_before_date) &&
    institutionRestrictionSatisfied;

  // If the user is not enrolled, and self-enrollment is allowed, then they can enroll.
  // If the user is enrolled and is invited/rejected/joined/removed, then they can join.
  const canSelfEnroll = selfEnrollmentAllowed && existingEnrollment == null;
  const canJoin =
    existingEnrollment != null &&
    ['invited', 'rejected', 'joined', 'removed'].includes(existingEnrollment.status);

  if (
    idsEqual(res.locals.user.user_id, res.locals.authn_user.user_id) &&
    res.locals.authz_data.authn_course_role === 'None' &&
    res.locals.authz_data.authn_course_instance_role === 'None' &&
    res.locals.authz_data.authn_has_student_access &&
    !res.locals.authz_data.authn_has_student_access_with_enrollment
  ) {
    if (canSelfEnroll || canJoin) {
      await ensureCheckedEnrollment({
        institution: res.locals.institution,
        course: res.locals.course,
        courseInstance,
        authzData: res.locals.authz_data,
        requestedRole: 'Student',
        actionDetail: 'implicit_joined',
      });

      // This is the only part of the `authz_data` that would change as a
      // result of this enrollment, so we can just update it directly.
      res.locals.authz_data.has_student_access_with_enrollment = true;
    } else if (existingEnrollment) {
      // Show blocked page
    }
  }

  next();
});
