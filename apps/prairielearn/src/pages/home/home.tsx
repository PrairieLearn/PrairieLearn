import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import { PageFooter } from '../../components/PageFooter.js';
import { PageLayout } from '../../components/PageLayout.js';
import { redirectToTermsPageIfNeeded } from '../../ee/lib/terms.js';
import { StaffInstitutionSchema } from '../../lib/client/safe-db-types.js';
import { config } from '../../lib/config.js';
import { isEnterprise } from '../../lib/license.js';

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
        user_id: res.locals.authn_user.user_id,
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
            resLocals={res.locals}
            instructorCourses={instructorCourses}
            studentCourses={studentCourses}
            adminInstitutions={adminInstitutions}
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

export default router;
