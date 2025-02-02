import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import { redirectToTermsPageIfNeeded } from '../../ee/lib/terms.js';
import { config } from '../../lib/config.js';
import { selectInstructorCourses } from '../../lib/course.js';
import { InstitutionSchema } from '../../lib/db-types.js';
import { isEnterprise } from '../../lib/license.js';

import { Home, StudentCourseSchema } from './home.html.js';

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

    const instructorCourses = await selectInstructorCourses({
      userId: res.locals.authn_user.user_id,
      isAdministrator: res.locals.is_administrator,
      includeExampleCourse: res.locals.is_administrator || config.devMode,
    });

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
      StudentCourseSchema,
    );

    const adminInstitutions = await queryRows(
      sql.select_admin_institutions,
      {
        user_id: res.locals.authn_user.user_id,
      },
      InstitutionSchema,
    );

    res.send(Home({ resLocals: res.locals, instructorCourses, studentCourses, adminInstitutions }));
  }),
);

export default router;
