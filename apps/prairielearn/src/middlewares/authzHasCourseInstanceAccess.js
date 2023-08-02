const error = require('@prairielearn/error');

module.exports = function (req, res, next) {
  if (
    // Effective user is course instructor.
    res.locals.authz_data.has_course_permission_preview ||
    // Effective user is course instance instructor.
    res.locals.authz_data.has_course_instance_permission_view ||
    // Effective user is enrolled in the course instance.
    res.locals.authz_data.has_student_access_with_enrollment ||
    // Effective user has student access to the course instance,
    // and the authenticated user is either a course instructor or
    // a course instance instructor.
    //
    // This is a separate case because we don't automatically enroll
    // instructors in their own course instances, but we still want
    // them to be able to access the course instance like a student.
    (res.locals.authz_data.has_student_access &&
      (res.locals.authz_data.authn_has_course_permission_preview ||
        res.locals.authz_data.authn_has_course_instance_permission_view))
  ) {
    return next();
  } else {
    return next(error.make(403, 'Access denied', { locals: res.locals }));
  }
};
