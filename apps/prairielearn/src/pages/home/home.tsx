import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';

import { execute, loadSqlEquiv, queryRow, queryRows } from '@prairielearn/postgres';

import { PageFooter } from '../../components/PageFooter.js';
import { PageLayout } from '../../components/PageLayout.js';
import { redirectToTermsPageIfNeeded } from '../../ee/lib/terms.js';
import { getPageContext } from '../../lib/client/page-context.js';
import { StaffInstitutionSchema } from '../../lib/client/safe-db-types.js';
import { config } from '../../lib/config.js';
import { CourseInstanceSchema, CourseSchema, InstitutionSchema } from '../../lib/db-types.js';
import { features } from '../../lib/features/index.js';
import { isEnterprise } from '../../lib/license.js';
import { authzCourseOrInstance } from '../../middlewares/authzCourseOrInstance.js';
import { ensureCheckedEnrollment } from '../../models/enrollment.js';

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
        user_id: res.locals.authn_user.user_id,
        is_administrator: res.locals.is_administrator,
        // Example courses are only shown to users who are either instructors of
        // at least one other course, or who are admins. They're also shown
        // unconditionally in dev mode.
        include_example_course: res.locals.is_administrator || config.devMode,
      },
      InstructorHomePageCourseSchema,
    );

    const studentCourses = await queryRows(
      sql.select_student_courses,
      {
        // Use the authenticated user, not the authorized user.
        user_id: res.locals.authn_user.user_id,
        pending_uid: res.locals.authn_user.uid,
        req_date: res.locals.req_date,
        // This is a somewhat ugly escape hatch specifically for load testing. In
        // general, we don't want to clutter the home page with example course
        // enrollments, but for load testing we want to enroll a large number of
        // users in the example course and then have them find the example course
        // on the home page. So, you'd make a request like this:
        // `/pl?include_example_course_enrollments=true`
        include_example_course_enrollments: req.query.include_example_course_enrollments === 'true',
      },
      StudentHomePageCourseSchema,
    );

    const adminInstitutions = await queryRows(
      sql.select_admin_institutions,
      { user_id: res.locals.authn_user.user_id },
      StaffInstitutionSchema,
    );

    const { authn_provider_name, __csrf_token, urlPrefix } = getPageContext(res.locals, {
      withAuthzData: false,
    });

    const enrollmentManagementEnabled = await features.enabled('enrollment-management', {
      institution_id: res.locals.authn_institution.id,
    });

    res.send(
      PageLayout({
        resLocals: res.locals,
        pageTitle: 'Home',
        navContext: {
          type: 'plain',
          page: 'home',
        },
        options: {
          fullHeight: true,
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
            enrollmentManagementEnabled={enrollmentManagementEnabled}
          />
        ),
        postContent:
          config.homepageFooterText && config.homepageFooterTextHref ? (
            <footer class="footer fw-light text-light text-center small">
              <div class="bg-secondary p-1">
                <a class="text-light" href={config.homepageFooterTextHref}>
                  {config.homepageFooterText}
                </a>
              </div>
            </footer>
          ) : (
            <PageFooter />
          ),
      }),
    );
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const BodySchema = z.object({
      __action: z.enum(['accept_invitation', 'reject_invitation', 'unenroll', 'enroll']),
      course_instance_id: z.string().min(1),
    });
    const body = BodySchema.parse(req.body);

    const {
      authn_user: { uid, user_id },
    } = getPageContext(res.locals, { withAuthzData: false });

    if (body.__action === 'accept_invitation') {
      await execute(sql.accept_invitation, {
        course_instance_id: body.course_instance_id,
        uid,
        user_id,
      });
    } else if (body.__action === 'reject_invitation') {
      await execute(sql.reject_invitation, {
        course_instance_id: body.course_instance_id,
        uid,
      });
    } else if (body.__action === 'unenroll') {
      await execute(sql.unenroll, {
        course_instance_id: body.course_instance_id,
        user_id,
        req_date: res.locals.req_date,
      });
    } else if (body.__action === 'enroll') {
      const { institution, course, course_instance } = await queryRow(
        sql.select_course_instance,
        { course_instance_id: body.course_instance_id },
        z.object({
          institution: InstitutionSchema,
          course: CourseSchema,
          course_instance: CourseInstanceSchema,
        }),
      );

      // Abuse the middleware to authorize the user for the course instance.
      req.params.course_instance_id = course_instance.id;
      await authzCourseOrInstance(req, res);

      await ensureCheckedEnrollment({
        institution,
        course,
        course_instance,
        authz_data: res.locals.authz_data,
      });
    }

    res.redirect(req.originalUrl);
  }),
);

export default router;
