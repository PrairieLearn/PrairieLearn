import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { Hydrate } from '@prairielearn/react/server';

import { EnrollmentPage } from '../../components/EnrollmentPage.js';
import { PageLayout } from '../../components/PageLayout.js';
import { extractPageContext } from '../../lib/client/page-context.js';
import { idsEqual } from '../../lib/id.js';
import {
  admitUserWithCourseInstanceAdmissionSelection,
  selectCourseInstanceAdmissionForRequest,
} from '../../models/course-instance-admission-continuation.js';
import {
  CourseInstanceAdmissionEligibilityError,
  CourseInstanceEnrollmentCodeRequiredError,
} from '../../models/course-instance-admission.js';

import { EnrollmentCodeRequired } from './enrollmentCodeRequired.html.js';

const router = Router();

router.get(
  '/:code?',
  asyncHandler(async (req, res) => {
    const code = req.params.code as string | undefined;
    // If they were redirected here, it will have a url param named `url`.
    const { url } = req.query;

    const { course_instance: courseInstance } = extractPageContext(res.locals, {
      pageType: 'courseInstance',
      // We should be careful to not pass `courseInstance` to the hydrated page.
      accessType: 'instructor',
    });
    const redirectUrl =
      typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') ? url : null;
    const redirectAfterJoin = () => {
      if (redirectUrl != null) {
        res.redirect(redirectUrl);
      } else {
        res.redirect(`/pl/course_instance/${courseInstance.id}/assessments`);
      }
    };

    if (
      !idsEqual(res.locals.user.id, res.locals.authn_user.id) ||
      res.locals.authz_data.authn_course_role !== 'None' ||
      res.locals.authz_data.authn_course_instance_role !== 'None' ||
      res.locals.is_administrator ||
      !res.locals.authz_data.authn_has_student_access
    ) {
      redirectAfterJoin();
      return;
    }

    const admissionSelection = await selectCourseInstanceAdmissionForRequest({
      course: res.locals.course,
      courseInstance,
      enrollmentCode: code,
      session: req.session,
      user: res.locals.authn_user,
    });
    const admissionPlan = admissionSelection.plan;

    if (admissionPlan.type === 'blocked') {
      res.status(403).send(EnrollmentPage({ resLocals: res.locals, type: 'blocked' }));
      return;
    }
    if (admissionPlan.type === 'ineligible') {
      res.status(403).send(EnrollmentPage({ resLocals: res.locals, type: admissionPlan.reason }));
      return;
    }
    if (admissionPlan.type === 'already_joined') {
      redirectAfterJoin();
      return;
    }

    let shouldRenderEnrollmentCodeForm = admissionPlan.type === 'enrollment_code_required';
    if (
      admissionPlan.type === 'conventional_invitation' ||
      admissionPlan.type === 'institution_roster_invitation' ||
      admissionPlan.type === 'lti13_roster_invitation' ||
      (admissionPlan.type === 'self_enrollment' && admissionPlan.enrollmentCodeValidated)
    ) {
      try {
        const result = await admitUserWithCourseInstanceAdmissionSelection({
          courseInstanceId: courseInstance.id,
          enrollmentCode: code,
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
        } else if (!(error instanceof CourseInstanceEnrollmentCodeRequiredError)) {
          throw error;
        } else {
          shouldRenderEnrollmentCodeForm = true;
        }
      }
    }

    if (!shouldRenderEnrollmentCodeForm) {
      redirectAfterJoin();
      return;
    }

    res.send(
      PageLayout({
        resLocals: res.locals,
        pageTitle: 'Enrollment Code Required',
        navContext: {
          type: 'student',
          page: 'enroll',
        },
        content: (
          <Hydrate>
            <EnrollmentCodeRequired courseInstanceId={courseInstance.id} />
          </Hydrate>
        ),
      }),
    );
  }),
);

export default router;
