import express from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import {
  loadSqlEquiv,
  queryOneRowAsync,
  queryRow,
  queryRows,
  queryZeroOrOneRowAsync,
} from '@prairielearn/postgres';

import { CourseInstanceSchema, CourseSchema, InstitutionSchema } from '../../lib/db-types.js';
import { authzCourseOrInstance } from '../../middlewares/authzCourseOrInstance.js';
import forbidAccessInExamMode from '../../middlewares/forbidAccessInExamMode.js';
import { ensureCheckedEnrollment } from '../../models/enrollment.js';

import {
  CourseInstanceRowSchema,
  Enroll,
  EnrollLtiMessage,
  EnrollmentLimitExceededMessage,
} from './enroll.html.js';

const router = express.Router();
const sql = loadSqlEquiv(import.meta.url);

router.get('/', [
  // If a student gains control of a course, they could update the course
  // title to contain arbitrary information and use the enrollment page to
  // access that during a CBTF exam. We'll block access to prevent this.
  forbidAccessInExamMode,
  asyncHandler(async (req, res) => {
    if (res.locals.authn_provider_name === 'LTI') {
      const result = await queryOneRowAsync(sql.lti_course_instance_lookup, {
        course_instance_id: res.locals.authn_user.lti_course_instance_id,
      });
      res.send(EnrollLtiMessage({ ltiInfo: result.rows[0], resLocals: res.locals }));
      return;
    }

    const courseInstances = await queryRows(
      sql.select_course_instances,
      {
        user_id: res.locals.authn_user.user_id,
        req_date: res.locals.req_date,
      },
      CourseInstanceRowSchema,
    );
    res.send(Enroll({ courseInstances, resLocals: res.locals }));
  }),
]);

router.get(
  '/limit_exceeded',
  asyncHandler((req, res) => {
    // Note that we deliberately omit the `forbidAccessInExamMode` middleware
    // here. A student could conceivably hit an enrollment limit while in exam
    // mode, so we'll allow them to see the error message. This page doesn't
    // leak any course-specific information.
    res.send(EnrollmentLimitExceededMessage({ resLocals: res.locals }));
  }),
);

router.post('/', [
  // As above, we'll block access in Exam mode to prevent data infiltration.
  forbidAccessInExamMode,
  asyncHandler(async (req, res) => {
    if (res.locals.authn_provider_name === 'LTI') {
      throw new error.HttpStatusError(400, 'Enrollment unavailable, managed via LTI');
    }

    const { institution, course, course_instance } = await queryRow(
      sql.select_course_instance,
      { course_instance_id: req.body.course_instance_id },
      z.object({
        institution: InstitutionSchema,
        course: CourseSchema,
        course_instance: CourseInstanceSchema,
      }),
    );

    const courseDisplayName = `${course.short_name}: ${course.title}, ${course_instance.long_name}`;

    if (req.body.__action === 'enroll') {
      // Abuse the middleware to authorize the user for the course instance.
      req.params.course_instance_id = course_instance.id;
      await authzCourseOrInstance(req, res);

      await ensureCheckedEnrollment({
        institution,
        course,
        course_instance,
        authz_data: res.locals.authz_data,
      });

      flash('success', `You have joined ${courseDisplayName}.`);
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'unenroll') {
      await queryZeroOrOneRowAsync(sql.unenroll, {
        course_instance_id: req.body.course_instance_id,
        user_id: res.locals.authn_user.user_id,
        req_date: res.locals.req_date,
      });
      flash('success', `You have left ${courseDisplayName}.`);
      res.redirect(req.originalUrl);
    } else {
      throw new error.HttpStatusError(400, 'unknown action: ' + res.locals.__action);
    }
  }),
]);

export default router;
