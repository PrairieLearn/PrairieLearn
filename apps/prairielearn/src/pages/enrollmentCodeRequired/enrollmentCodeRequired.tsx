import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { Hydrate } from '@prairielearn/react/server';

import { EnrollmentPage } from '../../components/EnrollmentPage.js';
import { PageLayout } from '../../components/PageLayout.js';
import { extractPageContext } from '../../lib/client/page-context.js';
import {
  admitUserForCourseInstanceAccess,
  selectEnrollmentAccessDecision,
} from '../../lib/enrollment/admission.js';
import { idsEqual } from '../../lib/id.js';

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

    const decision = await selectEnrollmentAccessDecision({
      course: res.locals.course,
      courseInstance,
      enrollmentCode: code,
      user: res.locals.authn_user,
    });

    if (decision.allowed) {
      await admitUserForCourseInstanceAccess({
        courseInstanceId: courseInstance.id,
        enrollmentCode: code,
        ip: req.ip ?? null,
        isAdministrator: res.locals.is_administrator,
        reqDate: res.locals.req_date,
        userId: res.locals.authn_user.id,
      });

      redirectAfterJoin();
      return;
    }

    if (decision.reason === 'already_joined') {
      redirectAfterJoin();
      return;
    }
    if (decision.reason !== 'enrollment_code_required') {
      res.status(403).send(EnrollmentPage({ reason: decision.reason, resLocals: res.locals }));
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
