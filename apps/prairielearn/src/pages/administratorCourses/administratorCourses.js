// @ts-check
const asyncHandler = require('express-async-handler');
import * as express from 'express';

import * as error from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';

import { config } from '../../lib/config';
import { InstitutionSchema, CourseSchema } from '../../lib/db-types';
import {
  createCourseFromRequest,
  getCourseRequests,
  updateCourseRequest,
} from '../../lib/course-request';
import { selectAllInstitutions } from '../../models/institution';

const router = express.Router();
const sql = sqldb.loadSqlEquiv(__filename);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.locals.coursesRoot = config.coursesRoot;
    res.locals.course_requests = await getCourseRequests(false);
    res.locals.institutions = await selectAllInstitutions();
    res.locals.courses = await sqldb.queryRows(
      sql.select_courses,
      CourseSchema.extend({
        institution: InstitutionSchema,
      }),
    );
    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (!res.locals.is_administrator) throw error.make(403, 'Insufficient permissions');

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
      updateCourseRequest(req, res);
    } else if (req.body.__action === 'create_course_from_request') {
      createCourseFromRequest(req, res);
    } else {
      throw error.make(400, 'unknown __action', {
        locals: res.locals,
        body: req.body,
      });
    }
  }),
);

export default router;
