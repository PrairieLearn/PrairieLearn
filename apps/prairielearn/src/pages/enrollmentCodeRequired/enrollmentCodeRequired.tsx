import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';

import { flash } from '@prairielearn/flash';
import { Hydrate } from '@prairielearn/preact/server';

import { PageLayout } from '../../components/PageLayout.js';
import { getCourseInstanceContext, getPageContext } from '../../lib/client/page-context.js';
import { idsEqual } from '../../lib/id.js';
import { authzCourseOrInstance } from '../../middlewares/authzCourseOrInstance.js';
import { selectCourseInstanceByEnrollmentCode } from '../../models/course-instances.js';
import { ensureCheckedEnrollment } from '../../models/enrollment.js';

import { EnrollmentCodeRequired } from './enrollmentCodeRequired.html.js';

const router = Router();

router.get(
  '/:code?',
  asyncHandler(async (req, res) => {
    const code = req.params.code as string | undefined;
    // If they were redirected here, it will have a url param named `url`.
    const { url } = req.query;

    const { course_instance: courseInstance } = getCourseInstanceContext(res.locals, 'instructor');
    const enrollmentCode = courseInstance.enrollment_code;
    const redirectUrl = typeof url === 'string' ? url : null;

    if (
      // No self-enrollment, abort
      !courseInstance.self_enrollment_enabled ||
      // No enrollment code required, abort
      !courseInstance.self_enrollment_use_enrollment_code ||
      // Enrollment code is correct, abort
      code?.toUpperCase() === enrollmentCode.toUpperCase()
    ) {
      if (code?.toUpperCase() === enrollmentCode.toUpperCase()) {
        // Authorize the user for the course instance
        req.params.course_instance_id = courseInstance.id;
        await authzCourseOrInstance(req, res);

        // Enroll the user
        await ensureCheckedEnrollment({
          institution: res.locals.institution,
          course: res.locals.course,
          course_instance: res.locals.course_instance,
          authz_data: res.locals.authz_data,
          action_detail: 'implicit_joined',
        });
      }
      // redirect to a different page, which will have proper authorization.
      if (redirectUrl != null) {
        res.redirect(redirectUrl);
      } else {
        res.redirect(`/pl/course_instance/${courseInstance.id}/assessments`);
      }
      return;
    }

    const { __csrf_token } = getPageContext(res.locals, {
      withAuthzData: false,
    });

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
            <EnrollmentCodeRequired csrfToken={__csrf_token} />
          </Hydrate>
        ),
      }),
    );
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const BodySchema = z.object({
      __action: z.enum(['validate_code']),
      enrollment_code: z.string().min(1).max(255),
    });

    const { url } = req.query;
    const redirectUrl = typeof url === 'string' ? url : null;

    const body = BodySchema.parse(req.body);

    // Look up the course instance by enrollment code
    const foundCourseInstance = await selectCourseInstanceByEnrollmentCode(body.enrollment_code);

    if (!foundCourseInstance) {
      flash('error', 'Invalid enrollment code. Please check your code and try again.');
      res.redirect(req.originalUrl);
      return;
    }

    // Check that the enrollment code is for the current course instance
    const { course_instance: courseInstance } = getCourseInstanceContext(res.locals, 'instructor');

    if (!idsEqual(foundCourseInstance.id, courseInstance.id)) {
      flash('error', 'Invalid enrollment code. Please check your code and try again.');
      res.redirect(req.originalUrl);
      return;
    }

    // Check if self-enrollment is enabled for this course instance
    if (
      !courseInstance.self_enrollment_enabled ||
      !courseInstance.self_enrollment_use_enrollment_code
    ) {
      flash('error', 'Self-enrollment codes are not enabled for this course.');
      res.redirect(req.originalUrl);
      return;
    }

    // Authorize the user for the course instance
    req.params.course_instance_id = courseInstance.id;
    await authzCourseOrInstance(req, res);

    // Enroll the user
    await ensureCheckedEnrollment({
      institution: res.locals.institution,
      course: res.locals.course,
      course_instance: res.locals.course_instance,
      authz_data: res.locals.authz_data,
      action_detail: 'explicit_joined',
    });

    const courseDisplayName = `${res.locals.course.short_name}: ${res.locals.course.title}, ${res.locals.course_instance.long_name}`;
    flash('success', `You have joined ${courseDisplayName}.`);

    // Redirect to the specified URL or to the assessments page
    if (redirectUrl != null) {
      res.redirect(redirectUrl);
    } else {
      res.redirect(`/pl/course_instance/${courseInstance.id}/assessments`);
    }
  }),
);

export default router;
