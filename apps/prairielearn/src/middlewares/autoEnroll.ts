import asyncHandler from 'express-async-handler';

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
  const existingEnrollment = await selectOptionalEnrollmentByUid({
    uid: res.locals.authn_user.uid,
    course_instance_id: courseInstance.id,
  });

  // If we have self-enrollment enabled, and it is before the enabled before date,
  // then we can enroll the user.
  const selfEnrollmentAllowed =
    courseInstance.self_enrollment_enabled &&
    (courseInstance.self_enrollment_enabled_before_date == null ||
      new Date() < courseInstance.self_enrollment_enabled_before_date);

  // If the user is not enrolled, and self-enrollment is allowed, then they can enroll.
  // If the user is enrolled and is invited/rejected/joined/removed, then they can join.
  const canEnroll = ((selfEnrollmentAllowed && existingEnrollment == null) ||
    (existingEnrollment != null && ['invited', 'rejected', 'joined', 'removed'].includes(existingEnrollment.status)));

  if (
    idsEqual(res.locals.user.user_id, res.locals.authn_user.user_id) &&
    res.locals.authz_data.authn_course_role === 'None' &&
    res.locals.authz_data.authn_course_instance_role === 'None' &&
    res.locals.authz_data.authn_has_student_access &&
    !res.locals.authz_data.authn_has_student_access_with_enrollment &&
    canEnroll
  ) {
    await ensureCheckedEnrollment({
      institution: res.locals.institution,
      course: res.locals.course,
      course_instance: res.locals.course_instance,
      authz_data: res.locals.authz_data,
      action_detail: 'implicit_joined',
    });

    // This is the only part of the `authz_data` that would change as a
    // result of this enrollment, so we can just update it directly.
    res.locals.authz_data.has_student_access_with_enrollment = true;
  }

  next();
});
