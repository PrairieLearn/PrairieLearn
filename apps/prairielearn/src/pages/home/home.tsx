import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';
import { run } from '@prairielearn/run';
import { assertNever } from '@prairielearn/utils';

import { PageLayout } from '../../components/PageLayout.js';
import { redirectToTermsPageIfNeeded } from '../../ee/lib/terms.js';
import { constructCourseOrInstanceContext } from '../../lib/authz-data.js';
import { extractPageContext } from '../../lib/client/page-context.js';
import { StaffInstitutionSchema } from '../../lib/client/safe-db-types.js';
import { config } from '../../lib/config.js';
import { idsEqual } from '../../lib/id.js';
import { isEnterprise } from '../../lib/license.js';
import { computeStatus } from '../../lib/publishing.js';
import { getUrl } from '../../lib/url.js';
import {
  ensureEnrollment,
  selectOptionalEnrollmentByUid,
  setEnrollmentStatus,
} from '../../models/enrollment.js';

import { Home, InstructorHomePageCourseSchema, StudentHomePageCourseSchema } from './home.html.js';

const sql = loadSqlEquiv(import.meta.url);
const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.locals.navPage = 'home';

    // Potentially prompt the user to accept the terms before proceeding.
    if (isEnterprise()) {
      await redirectToTermsPageIfNeeded(res, res.locals.authn_user, req.ip, req.originalUrl);
    }

    const instructorCourses = await queryRows(
      sql.select_instructor_courses,
      {
        user_id: res.locals.authn_user.id,
        is_administrator: res.locals.is_administrator,
        // Example courses are only shown to users who are either instructors of
        // at least one other course, or who are admins. They're also shown
        // unconditionally in dev mode.
        include_example_course: res.locals.is_administrator || config.devMode,
      },
      InstructorHomePageCourseSchema,
    );

    // Query all student courses (both legacy and modern publishing) in a single query
    const allStudentCourses = await queryRows(
      sql.select_student_courses,
      {
        // Use the authenticated user, not the authorized user.
        user_id: res.locals.authn_user.id,
        pending_uid: res.locals.authn_user.uid,
        // This is a somewhat ugly escape hatch specifically for load testing. In
        // general, we don't want to clutter the home page with example course
        // enrollments, but for load testing we want to enroll a large number of
        // users in the example course and then have them find the example course
        // on the home page. So, you'd make a request like this:
        // `/pl?include_example_course_enrollments=true`
        include_example_course_enrollments: req.query.include_example_course_enrollments === 'true',
        req_date: res.locals.req_date,
      },
      StudentHomePageCourseSchema,
    );

    const studentCourses = allStudentCourses.filter((entry) => {
      // Filter out courses where user also has instructor access.
      if (instructorCourses.some((course) => idsEqual(course.id, entry.course_id))) return false;

      // Legacy courses are already filtered by check_course_instance_access in SQL
      if (!entry.course_instance.modern_publishing) return true;

      // For modern publishing courses, check access dates
      const startDate = entry.course_instance.publishing_start_date;
      const endDate = run(() => {
        if (entry.course_instance.publishing_end_date == null) {
          return null;
        }

        if (
          entry.latest_publishing_extension == null ||
          entry.course_instance.publishing_end_date > entry.latest_publishing_extension.end_date
        ) {
          return entry.course_instance.publishing_end_date;
        }

        return entry.latest_publishing_extension.end_date;
      });

      return (
        startDate !== null &&
        endDate !== null &&
        startDate < res.locals.req_date &&
        res.locals.req_date < endDate
      );
    });

    const adminInstitutions = await queryRows(
      sql.select_admin_institutions,
      { user_id: res.locals.authn_user.id },
      StaffInstitutionSchema,
    );

    const { authn_provider_name, __csrf_token, urlPrefix } = extractPageContext(res.locals, {
      pageType: 'plain',
      accessType: 'student',
      withAuthzData: false,
    });

    const search = getUrl(req).search;

    res.send(
      PageLayout({
        resLocals: res.locals,
        pageTitle: 'Home',
        navContext: {
          type: 'plain',
          page: 'home',
        },
        options: {
          showFooter: true,
        },
        content: (
          <Home
            canAddCourses={authn_provider_name !== 'LTI'}
            csrfToken={__csrf_token}
            instructorCourses={instructorCourses}
            studentCourses={studentCourses}
            adminInstitutions={adminInstitutions}
            urlPrefix={urlPrefix}
            isDevMode={config.devMode}
            search={search}
          />
        ),
      }),
    );
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const BodySchema = z.object({
      __action: z.enum(['accept_invitation', 'reject_invitation', 'unenroll']),
      course_instance_id: z.string().min(1),
    });
    const body = BodySchema.parse(req.body);

    const {
      authn_user: { uid },
    } = extractPageContext(res.locals, {
      pageType: 'plain',
      accessType: 'student',
      withAuthzData: false,
    });

    const { authzData, courseInstance, institution, course } =
      await constructCourseOrInstanceContext({
        user: res.locals.authn_user,
        course_id: null,
        course_instance_id: body.course_instance_id,
        ip: req.ip ?? null,
        req_date: res.locals.req_date,
        is_administrator: res.locals.is_administrator,
      });

    if (authzData === null || courseInstance === null) {
      throw new HttpStatusError(403, 'Access denied');
    }

    // Invitations and rejections are only supported for modern publishing courses.
    if (
      !courseInstance.modern_publishing &&
      ['accept_invitation', 'reject_invitation'].includes(body.__action)
    ) {
      flash(
        'error',
        'Invitations and rejections are only supported for courses using modern publishing.',
      );
      res.redirect(req.originalUrl);
      return;
    }

    if (
      courseInstance.modern_publishing &&
      computeStatus(courseInstance.publishing_start_date, courseInstance.publishing_end_date) !==
        'published'
    ) {
      flash('error', 'This course instance is not accessible to students');
      res.redirect(req.originalUrl);
      return;
    }

    switch (body.__action) {
      case 'accept_invitation': {
        const enrollment = await selectOptionalEnrollmentByUid({
          courseInstance,
          uid,
          requiredRole: ['Student'],
          authzData,
        });
        if (
          !enrollment ||
          !['left', 'removed', 'rejected', 'invited', 'joined'].includes(enrollment.status)
        ) {
          flash('error', 'Failed to accept invitation');
          break;
        }

        await ensureEnrollment({
          institution,
          course,
          courseInstance,
          authzData,
          requiredRole: ['Student'],
          actionDetail: 'invitation_accepted',
        });
        break;
      }
      case 'reject_invitation': {
        const enrollment = await selectOptionalEnrollmentByUid({
          courseInstance,
          uid,
          requiredRole: ['Student'],
          authzData,
        });

        if (!enrollment || !['invited', 'rejected'].includes(enrollment.status)) {
          flash('error', 'Failed to reject invitation');
          break;
        }

        await setEnrollmentStatus({
          enrollment,
          status: 'rejected',
          authzData,
          requiredRole: ['Student'],
        });
        break;
      }
      case 'unenroll': {
        const enrollment = await selectOptionalEnrollmentByUid({
          courseInstance,
          uid,
          requiredRole: ['Student'],
          authzData,
        });

        if (!enrollment || !['joined', 'left', 'removed'].includes(enrollment.status)) {
          flash('error', 'Failed to unenroll');
          break;
        }

        await setEnrollmentStatus({
          enrollment,
          status: 'left',
          authzData,
          requiredRole: ['Student'],
        });
        break;
      }
      default: {
        assertNever(body.__action);
      }
    }

    res.redirect(req.originalUrl);
  }),
);

export default router;
