import asyncHandler = require('express-async-handler');
import * as express from 'express';

import * as error from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';

import { config } from '../../lib/config';
import {
  createCourseFromRequest,
  selectPendingCourseRequests,
  updateCourseRequest,
} from '../../lib/course-request';
import { selectAllInstitutions } from '../../models/institution';
import { AdministratorCourses, CourseWithInstitutionSchema } from './administratorCourses.html';

const router = express.Router();
const sql = sqldb.loadSqlEquiv(__filename);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const course_requests = await selectPendingCourseRequests();
    const institutions = await selectAllInstitutions();
    const courses = await sqldb.queryRows(sql.select_courses, CourseWithInstitutionSchema);
    res.send(
      AdministratorCourses({
        course_requests,
        institutions,
        courses,
        coursesRoot: config.coursesRoot,
        resLocals: res.locals,
      }),
    );
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (req.body.__action === 'courses_insert') {
      await sqldb.callAsync('courses_insert', [
        req.body.institution_id,
        req.body.short_name,
        req.body.title,
        req.body.display_timezone,
        req.body.path,
        req.body.repository,
        req.body.branch,
        res.locals.authn_user.user_id,
      ]);
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'courses_update_column') {
      await sqldb.callAsync('courses_update_column', [
        req.body.course_id,
        req.body.column_name,
        req.body.value,
        res.locals.authn_user.user_id,
      ]);
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'courses_delete') {
      const result = await sqldb.queryZeroOrOneRowAsync(sql.select_course, {
        course_id: req.body.course_id,
      });
      if (result.rowCount !== 1) throw new Error('course not found');

      const short_name = result.rows[0].short_name;
      if (req.body.confirm_short_name !== short_name) {
        throw new Error(
          'deletion aborted: confirmation string "' +
            req.body.confirm_short_name +
            '" did not match expected value of "' +
            short_name +
            '"',
        );
      }

      await sqldb.callAsync('courses_delete', [req.body.course_id, res.locals.authn_user.user_id]);
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'approve_deny_course_request') {
      await updateCourseRequest(req, res);
    } else if (req.body.__action === 'create_course_from_request') {
      await createCourseFromRequest(req, res);
    } else {
      throw error.make(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
