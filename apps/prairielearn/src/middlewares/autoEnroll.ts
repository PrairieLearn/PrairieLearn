import { EnrollmentPage } from '../components/EnrollmentPage.js';
import {
  admitUserForCourseInstanceAccess,
  selectEnrollmentAccessDecision,
} from '../lib/enrollment/admission.js';
import { idsEqual } from '../lib/id.js';
import { typedAsyncHandler } from '../lib/res-locals.js';

export default typedAsyncHandler<'course-instance'>(async (req, res, next) => {
  // If the user does not currently have access to the course, but could if
  // they were enrolled, automatically enroll them. However, we will not
  // attempt to enroll them if they are an instructor (that is, if they have
  // a specific role in the course or course instance) or if they are
  // impersonating another user.

  // TODO: check if self-enrollment requires a secret link.

  if (
    idsEqual(res.locals.user.id, res.locals.authn_user.id) &&
    res.locals.authz_data.authn_course_role === 'None' &&
    res.locals.authz_data.authn_course_instance_role === 'None' &&
    res.locals.authz_data.authn_has_student_access &&
    !res.locals.authz_data.authn_has_student_access_with_enrollment
  ) {
    const decision = await selectEnrollmentAccessDecision({
      course: res.locals.course,
      courseInstance: res.locals.course_instance,
      user: res.locals.authn_user,
    });

    if (decision.allowed) {
      await admitUserForCourseInstanceAccess({
        courseInstanceId: res.locals.course_instance.id,
        ip: req.ip ?? null,
        isAdministrator: res.locals.is_administrator,
        reqDate: res.locals.req_date,
        userId: res.locals.authn_user.id,
      });

      // This is the only part of the `authz_data` that would change as a
      // result of this enrollment, so we can just update it directly.
      res.locals.authz_data.has_student_access_with_enrollment = true;
      res.locals.authz_data.authn_has_student_access_with_enrollment = true;
    } else if (decision.reason === 'already_joined') {
      res.locals.authz_data.has_student_access_with_enrollment = true;
      res.locals.authz_data.authn_has_student_access_with_enrollment = true;
    } else if (decision.reason === 'enrollment_code_required') {
      res.redirect(
        `/pl/course_instance/${res.locals.course_instance.id}/join?url=${encodeURIComponent(req.originalUrl)}`,
      );
      return;
    } else {
      res.status(403).send(EnrollmentPage({ reason: decision.reason, resLocals: res.locals }));
      return;
    }
  }

  next();
});
