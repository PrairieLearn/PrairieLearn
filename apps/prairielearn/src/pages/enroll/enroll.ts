import asyncHandler = require('express-async-handler');
import express = require('express');
import { z } from 'zod';
import * as error from '@prairielearn/error';
import {
  loadSqlEquiv,
  queryOneRowAsync,
  queryRow,
  queryRows,
  queryZeroOrOneRowAsync,
} from '@prairielearn/postgres';
import { flash } from '@prairielearn/flash';

import { InstitutionSchema, CourseInstanceSchema, CourseSchema } from '../../lib/db-types';
import {
  Enroll,
  EnrollLtiMessage,
  CourseInstanceRowSchema,
  EnrollmentLimitExceededMessage,
} from './enroll.html';
import { ensureCheckedEnrollment } from '../../models/enrollment';
import authzCourseOrInstance = require('../../middlewares/authzCourseOrInstance');
import { promisify } from 'node:util';

const router = express.Router();
const sql = loadSqlEquiv(__filename);

router.get(
  '/',
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
);

router.get(
  '/limit_exceeded',
  asyncHandler((req, res) => {
    res.send(EnrollmentLimitExceededMessage({ resLocals: res.locals }));
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (res.locals.authn_provider_name === 'LTI') {
      throw error.make(400, 'Enrollment unavailable, managed via LTI');
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
      await promisify(authzCourseOrInstance)(req, res);

      const didEnroll = await ensureCheckedEnrollment({
        institution,
        course,
        course_instance,
        authz_data: res.locals.authz_data,
        redirect: res.redirect.bind(res),
      });

      if (!didEnroll) {
        // We've already been redirected to the appropriate page; do nothing.
        return;
      }

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
      throw error.make(400, 'unknown action: ' + res.locals.__action);
    }
  }),
);

export default router;
