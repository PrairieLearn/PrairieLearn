import { EnrollmentPage } from '../components/EnrollmentPage.js';
import { idsEqual } from '../lib/id.js';
import { typedAsyncHandler } from '../lib/res-locals.js';
import {
  type CourseInstanceAdmissionSelectionLocals as AdmissionSelectionLocals,
  admitUserWithCourseInstanceAdmissionSelection,
  selectCourseInstanceAdmissionForRequest,
} from '../models/course-instance-admission-continuation.js';
import {
  CourseInstanceAdmissionEligibilityError,
  CourseInstanceEnrollmentCodeRequiredError,
} from '../models/course-instance-admission.js';

const autoEnroll = typedAsyncHandler<'course-instance', AdmissionSelectionLocals>(
  async (req, res, next) => {
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
      const admissionSelection =
        res.locals.course_instance_admission_selection ??
        (await selectCourseInstanceAdmissionForRequest({
          course: res.locals.course,
          courseInstance: res.locals.course_instance,
          session: req.session,
          user: res.locals.authn_user,
        }));
      const admissionPlan = admissionSelection.plan;

      if (
        admissionPlan.type === 'conventional_invitation' ||
        admissionPlan.type === 'institution_roster_invitation' ||
        admissionPlan.type === 'lti13_roster_invitation' ||
        admissionPlan.type === 'self_enrollment'
      ) {
        try {
          const result = await admitUserWithCourseInstanceAdmissionSelection({
            courseInstanceId: res.locals.course_instance.id,
            ip: req.ip ?? null,
            isAdministrator: res.locals.authz_data.authn_is_administrator,
            reqDate: res.locals.req_date,
            selection: admissionSelection,
            session: req.session,
            userId: res.locals.authn_user.id,
          });
          if (result.type === 'retry_ordinary') {
            res.redirect(req.originalUrl);
            return;
          }
          if (result.type === 'blocked') {
            res.status(403).send(EnrollmentPage({ resLocals: res.locals, type: 'blocked' }));
            return;
          }
        } catch (error) {
          if (error instanceof CourseInstanceAdmissionEligibilityError) {
            res.status(403).send(EnrollmentPage({ resLocals: res.locals, type: error.reason }));
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
  },
);

export default autoEnroll;
