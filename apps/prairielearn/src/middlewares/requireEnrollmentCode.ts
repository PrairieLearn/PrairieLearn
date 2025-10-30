import asyncHandler from 'express-async-handler';

import { getCourseInstanceContext } from '../lib/client/page-context.js';
import { selectOptionalEnrollmentByUserId } from '../models/enrollment.js';

export default asyncHandler(async (req, res, next) => {
  // The user will already be denied access if they are impersonating another user that is not enrolled in the course instance.

  // Check if the user needs an enrollment code to access the course instance.
  const { course_instance: courseInstance } = getCourseInstanceContext(res.locals, 'instructor');

  // Skip if user already has student access with enrollment
  if (res.locals.authz_data.authn_has_student_access_with_enrollment) {
    next();
    return;
  }

  // Skip if user is an instructor or administrator
  if (
    res.locals.authz_data.authn_course_role !== 'None' ||
    res.locals.authz_data.authn_course_instance_role !== 'None' ||
    res.locals.is_administrator
  ) {
    next();
    return;
  }

  // Check if self-enrollment is enabled and requires an enrollment code
  if (
    !courseInstance.self_enrollment_enabled ||
    !courseInstance.self_enrollment_use_enrollment_code
  ) {
    next();
    return;
  }

  // Check if self-enrollment is still allowed (before the cutoff date)
  const selfEnrollmentAllowed =
    courseInstance.self_enrollment_enabled_before_date == null ||
    new Date() < courseInstance.self_enrollment_enabled_before_date;

  if (!selfEnrollmentAllowed) {
    // TODO: Show nice error page
    next();
    return;
  }

  // Check if user has student access (they should be able to enroll)
  // This checks if access rules would allow them to enroll.
  if (!res.locals.authz_data.authn_has_student_access) {
    next();
    return;
  }

  // Check if user is already enrolled or blocked
  const existingEnrollment = await selectOptionalEnrollmentByUserId({
    userId: res.locals.authn_user.user_id,
    requestedRole: 'Student',
    authzData: res.locals.authz_data,
    courseInstance,
  });

  // If user is enrolled and joined/invited/rejected/removed, let them through.
  // This means that an invited/rejected user can skip the process of entering an enrollment code.
  if (
    existingEnrollment &&
    ['joined', 'invited', 'removed', 'rejected'].includes(existingEnrollment.status)
  ) {
    next();
    return;
  }

  // If user is blocked, don't redirect them to enrollment code page
  if (existingEnrollment?.status === 'blocked') {
    // TODO: Show nice error page
    next();
    return;
  }

  // User needs an enrollment code - redirect to the enrollment code page
  // Preserve the current URL as a query parameter so they can return after enrollment
  const currentUrl = req.originalUrl;
  const redirectUrl = `/pl/course_instance/${courseInstance.id}/join?url=${encodeURIComponent(currentUrl)}`;

  res.redirect(redirectUrl);
  return;
});
