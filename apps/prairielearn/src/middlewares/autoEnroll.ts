import { EnrollmentPage } from '../components/EnrollmentPage.js';
import { idsEqual } from '../lib/id.js';
import { typedAsyncHandler } from '../lib/res-locals.js';
import {
  CourseInstanceAdmissionEligibilityError,
  CourseInstanceEnrollmentCodeRequiredError,
  type CourseInstanceAdmissionPlanLocals as PlanLocals,
  admitUserWithCourseInstanceAdmissionPlan,
  selectCourseInstanceAdmissionPlan,
} from '../models/course-instance-admission.js';
import { EnrollmentAdmissionBlockedError } from '../models/enrollment-reconciliation.js';

const autoEnroll = typedAsyncHandler<'course-instance', PlanLocals>(async (req, res, next) => {
  // If the user does not currently have access to the course, but could if
  // they were enrolled, automatically enroll them. However, we will not
  // attempt to enroll them if they are an instructor (that is, if they have
  // a specific role in the course or course instance) or if they are
  // impersonating another user.

  if (
    idsEqual(res.locals.user.id, res.locals.authn_user.id) &&
    res.locals.authz_data.authn_course_role === 'None' &&
    res.locals.authz_data.authn_course_instance_role === 'None' &&
    res.locals.authz_data.authn_has_student_access &&
    !res.locals.authz_data.authn_has_student_access_with_enrollment
  ) {
    const admissionPlan =
      res.locals.course_instance_admission_plan ??
      (await selectCourseInstanceAdmissionPlan({
        course: res.locals.course,
        courseInstance: res.locals.course_instance,
        user: res.locals.authn_user,
      }));

    if (
      admissionPlan.type === 'conventional_invitation' ||
      admissionPlan.type === 'institution_roster_invitation' ||
      admissionPlan.type === 'self_enrollment'
    ) {
      try {
        await admitUserWithCourseInstanceAdmissionPlan({
          courseInstanceId: res.locals.course_instance.id,
          ip: req.ip ?? null,
          isAdministrator: res.locals.authz_data.authn_is_administrator,
          plan: admissionPlan,
          reqDate: res.locals.req_date,
          userId: res.locals.authn_user.id,
        });
      } catch (error) {
        if (error instanceof CourseInstanceAdmissionEligibilityError) {
          res.status(403).send(EnrollmentPage({ resLocals: res.locals, type: error.reason }));
          return;
        } else if (error instanceof EnrollmentAdmissionBlockedError) {
          res.status(403).send(EnrollmentPage({ resLocals: res.locals, type: 'blocked' }));
          return;
        } else if (error instanceof CourseInstanceEnrollmentCodeRequiredError) {
          res.redirect(
            `/pl/course_instance/${res.locals.course_instance.id}/join?url=${encodeURIComponent(req.originalUrl)}`,
          );
          return;
        } else {
          throw error;
        }
      }

      res.locals.authz_data.has_student_access_with_enrollment = true;
      res.locals.authz_data.authn_has_student_access_with_enrollment = true;
    } else if (admissionPlan.type === 'already_joined') {
      res.locals.authz_data.has_student_access_with_enrollment = true;
      res.locals.authz_data.authn_has_student_access_with_enrollment = true;
    } else if (admissionPlan.type === 'blocked') {
      res.status(403).send(EnrollmentPage({ resLocals: res.locals, type: 'blocked' }));
      return;
    } else if (admissionPlan.type === 'ineligible') {
      res.status(403).send(EnrollmentPage({ resLocals: res.locals, type: admissionPlan.reason }));
      return;
    } else {
      res.redirect(
        `/pl/course_instance/${res.locals.course_instance.id}/join?url=${encodeURIComponent(req.originalUrl)}`,
      );
      return;
    }
  }

  next();
});

export default autoEnroll;
