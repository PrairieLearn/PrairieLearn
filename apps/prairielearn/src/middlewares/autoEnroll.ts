import { Temporal } from '@js-temporal/polyfill';
import asyncHandler from 'express-async-handler';

import type { CourseInstance } from '../lib/db-types.js';
import { idsEqual } from '../lib/id.js';
import { ensureCheckedEnrollment, selectOptionalEnrollmentByUserId } from '../models/enrollment.js';

export default asyncHandler(async (req, res, next) => {
  // If the user does not currently have access to the course, but could if
  // they were enrolled, automatically enroll them. However, we will not
  // attempt to enroll them if they are an instructor (that is, if they have
  // a specific role in the course or course instance) or if they are
  // impersonating another user.

  // TODO: check if self-enrollment requires a secret link.

  const courseInstance: CourseInstance = res.locals.course_instance;

  const existingEnrollment = await selectOptionalEnrollmentByUserId({
    user_id: res.locals.authn_user.user_id,
    course_instance_id: courseInstance.id,
  });

  // If we have self-enrollment enabled, and it is before the enabled before date,
  // then we can enroll the user.
  const selfEnrollmentAllowed =
    courseInstance.self_enrollment_enabled &&
    (courseInstance.self_enrollment_enabled_before_date == null ||
      Temporal.Instant.compare(
        Temporal.Now.instant(),
        courseInstance.self_enrollment_enabled_before_date,
      ) < 0);

  if (
    idsEqual(res.locals.user.user_id, res.locals.authn_user.user_id) &&
    res.locals.authz_data.authn_course_role === 'None' &&
    res.locals.authz_data.authn_course_instance_role === 'None' &&
    res.locals.authz_data.authn_has_student_access &&
    !res.locals.authz_data.authn_has_student_access_with_enrollment &&
    selfEnrollmentAllowed &&
    (existingEnrollment == null || existingEnrollment.status !== 'blocked')
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
