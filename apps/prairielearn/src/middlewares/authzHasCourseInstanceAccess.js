const error = require('@prairielearn/error');

module.exports = function (req, res, next) {
  if (
    res.locals.authz_data.has_course_permission_preview ||
    res.locals.authz_data.has_course_instance_permission_view ||
    res.locals.authz_data.has_student_access_with_enrollment
  ) {
    return next();
  } else {
    return next(error.make(403, 'Access denied', { locals: res.locals }));
  }
};
