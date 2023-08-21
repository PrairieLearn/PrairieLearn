import asyncHandler = require('express-async-handler');
import { idsEqual } from '../lib/id';
import { ensureCheckedEnrollment } from '../models/enrollment';

export default asyncHandler(async (req, res, next) => {
  // If the user does not currently have access to the course, but could if
  // they were enrolled, automatically enroll them. However, we will not
  // attempt to enroll them if they are an instructor (that is, if they have
  // a specific role in the course or course instance) or if they are
  // impersonating another user.
  if (
    idsEqual(res.locals.user.user_id, res.locals.authn_user.user_id) &&
    res.locals.authz_data.authn_course_role === 'None' &&
    res.locals.authz_data.authn_course_instance_role === 'None' &&
    res.locals.authz_data.authn_has_student_access &&
    !res.locals.authz_data.authn_has_student_access_with_enrollment
  ) {
    const didEnroll = await ensureCheckedEnrollment({
      institution: res.locals.institution,
      course: res.locals.course,
      course_instance: res.locals.course_instance,
      authz_data: res.locals.authz_data,
      redirect: res.redirect.bind(res),
    });

    if (didEnroll) {
      // This is the only part of the `authz_data` that would change as a
      // result of this enrollment, so we can just update it directly.
      res.locals.authz_data.has_student_access_with_enrollment = true;
    } else {
      // The user has already been redirected to an appropriate page; do nothing.
      return;
    }
  }

  next();
});
