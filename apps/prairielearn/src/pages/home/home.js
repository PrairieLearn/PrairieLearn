// @ts-check
import * as express from 'express';
const asyncHandler = require('express-async-handler');
import * as sqldb from '@prairielearn/postgres';

import { config } from '../../lib/config';
import { isEnterprise } from '../../lib/license';
import { shouldRedirectToTermsPage, redirectToTermsPage } from '../../ee/lib/terms';

const sql = sqldb.loadSqlEquiv(__filename);
const router = express.Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.locals.navPage = 'home';
    res.locals.isAuthenticated = !!res.locals.authn_user;

    if (!res.locals.isAuthenticated) {
      res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
      return;
    }

    // Potentially prompt the user to accept the terms before proceeding.
    if (isEnterprise() && (await shouldRedirectToTermsPage(res.locals.authn_user, req.ip))) {
      redirectToTermsPage(res, req.originalUrl);
      return;
    }

    const result = await sqldb.queryOneRowAsync(sql.select_home, {
      user_id: res.locals.authn_user.user_id,
      is_administrator: res.locals.is_administrator,
      req_date: res.locals.req_date,
      // This is a somewhat ugly escape hatch specifically for load testing. In
      // general, we don't want to clutter the home page with example course
      // enrollments, but for load testing we want to enroll a large number of
      // users in the example course and then have them find the example course
      // on the home page. So, you'd make a request like this:
      // `/pl?include_example_course_enrollments=true`
      include_example_course_enrollments: req.query.include_example_course_enrollments === 'true',
    });

    res.locals.instructor_courses = result.rows[0].instructor_courses;
    res.locals.student_courses = result.rows[0].student_courses;

    // Example courses are only shown to users who are either instructors of
    // at least one other course, or who are admins. They're also shown
    // unconditionally in dev mode.
    if (res.locals.instructor_courses.length > 0 || res.locals.is_administrator || config.devMode) {
      res.locals.instructor_courses = res.locals.instructor_courses.concat(
        result.rows[0].example_courses,
      );
    }

    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
  }),
);

module.exports = router;
