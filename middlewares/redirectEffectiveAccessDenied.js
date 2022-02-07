const { idsEqual } = require('../lib/id');

module.exports = function (err, req, res, next) {
  // This middleware tries to handle the case where an instructor
  // starts emulating another effective user, but they are currently
  // on a page to which the effective user doesn't have
  // permission. This results in a 403 (Access Denied) error. Here
  // we try and detect this case and redirect to an accessible page.

  // we are only capturing 403 = Access Denied
  if (err.status !== 403) return next(err);

  // we only redirect if we tried to change emulation data (see middlewares/effectiveRequestChanged.js)
  if (!res.locals.pl_requested_data_changed) return next(err);

  // skip if we don't have user data
  if (res.locals?.authn_user?.user_id == null) return next(err);
  if (res.locals?.user?.user_id == null) return next(err);

  // we are only interested in cases where we are emulating a different user
  if (idsEqual(res.locals.authn_user.user_id, res.locals.user.user_id)) return next(err);

  // check that we have a plainUrlPrefix
  if (res.locals.plainUrlPrefix == null) return next(err);

  // try to redirect to the instructor course instance
  if (
    res.locals?.course_instance?.id &&
    (res.locals?.authz_data?.has_course_instance_permission_view ||
      res.locals?.authz_data?.has_course_permission_preview)
  ) {
    res.redirect(
      `${res.locals.plainUrlPrefix}/course_instance/${res.locals.course_instance.id}/instructor`
    );
    return;
  }

  // try to redirect to the instructor course
  if (res.locals?.course?.id && res.locals?.authz_data?.has_course_permission_preview) {
    res.redirect(`${res.locals.plainUrlPrefix}/course/${res.locals.course.id}`);
    return;
  }

  // try to redirect to the student course instance
  if (res.locals?.course_instance?.id && res.locals?.authz_data?.has_student_access) {
    res.redirect(`${res.locals.plainUrlPrefix}/course_instance/${res.locals.course_instance.id}`);
    return;
  }

  // give up, we couldn't figure out a useful redirect
  next(err);
};
