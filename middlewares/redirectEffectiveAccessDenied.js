
module.exports = function(err, req, res, next) {
    // This middleware tries to handle the case where an instructor
    // starts emulating another effective user, but they are currently
    // on a page to which the effective user doesn't have
    // permission. This results in a 403 (Access Denied) error. Here
    // we try and detect this case and redirect to an accessible page.
    //
    // There is a risk of redirect loops from this code. This could
    // happen if the page we are redirecting to is also inaccessible
    // by the effective user. We could use a cookie or query parameter
    // to try and avoid this, but for now we are relying on careful
    // checking here to make sure we redirect to an accessible page.

    // we are only capturing 403 = Access Denied
    if (err.status != 403) return next();

    // skip if we don't have user data
    if (res.locals?.authn_user?.user_id == null) return next();
    if (res.locals?.user?.user_id == null) return next();

    // we are only interested in cases where we are emulating a different user
    if (res.locals.authn_user.user_id == res.locals.user.user_id) return next();

    // check that we have a plainUrlPrefix
    if (res.locals.plainUrlPrefix == null) return next();

    // try to redirect to the instructor course instance
    if (res.locals?.course_instance?.id
        && (res.locals?.authz_data?.has_course_instance_permission_view
            || res.locals?.authz_data?.has_course_permission_preview)) {
        res.redirect(`${res.locals.plainUrlPrefix}/course_instance/${res.locals.course_instance.id}/instructor`);
        return;
    }

    // try to redirect to the instructor course
    if (res.locals?.course?.id
        && res.locals?.authz_data?.has_course_permission_preview) {
        res.redirect(`${res.locals.plainUrlPrefix}/course/${res.locals.course.id}`);
        return;
    }

    // try to redirect to the student course instance
    if (res.locals?.course_instance?.id
        && res.locals?.authz_data?.has_student_access) {
        res.redirect(`${res.locals.plainUrlPrefix}/course_instance/${res.locals.course_instance.id}`);
        return;
    }

    // give up, we couldn't figure out a useful redirect
    next();
};
