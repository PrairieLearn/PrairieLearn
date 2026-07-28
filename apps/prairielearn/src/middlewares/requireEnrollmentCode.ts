import { extractPageContext } from '../lib/client/page-context.js';
import { typedAsyncHandler } from '../lib/res-locals.js';
import {
  type OrdinaryCourseInstanceAdmissionLocals,
  selectOrdinaryCourseInstanceAdmissionDecision,
} from '../models/course-instance-admission.js';

export default typedAsyncHandler<'course-instance', OrdinaryCourseInstanceAdmissionLocals>(
  async (req, res, next) => {
    // The user will already be denied access if they are impersonating another user that is not enrolled in the course instance.

    // Check if the user needs an enrollment code to access the course instance.
    const { course_instance: courseInstance } = extractPageContext(res.locals, {
      pageType: 'courseInstance',
      accessType: 'instructor',
    });

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

    // Check if user has student access (they should be able to enroll)
    // This checks if access rules would allow them to enroll.
    if (!res.locals.authz_data.authn_has_student_access) {
      next();
      return;
    }

    const decision = await selectOrdinaryCourseInstanceAdmissionDecision({
      course: res.locals.course,
      courseInstance,
      user: res.locals.authn_user,
    });
    res.locals.ordinary_course_instance_admission_decision = decision;

    if (decision.allowed || decision.reason !== 'enrollment_code_required') {
      next();
      return;
    }

    // User needs an enrollment code - redirect to the enrollment code page
    // Preserve the current URL as a query parameter so they can return after enrollment
    const currentUrl = req.originalUrl;
    const redirectUrl = `/pl/course_instance/${courseInstance.id}/join?url=${encodeURIComponent(currentUrl)}`;

    res.redirect(redirectUrl);
    return;
  },
);
