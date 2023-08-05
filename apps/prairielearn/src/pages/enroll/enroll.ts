import asyncHandler = require('express-async-handler');
import express = require('express');
import { z } from 'zod';
import error = require('@prairielearn/error');
import {
  loadSqlEquiv,
  queryAsync,
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
import { isEnterprise } from '../../lib/license';
import { insertCheckedEnrollment } from '../../ee/models/enrollment';
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
      // Enrollment limits can only be configured on enterprise instances, so
      // we'll also only check and enforce the limits on enterprise instances.
      //
      // Note that this check is susceptible to race conditions: if two users
      // enroll at the same time, they may both be able to enroll even if the
      // enrollment limit would be exceeded. We've decided that this is
      // acceptable behavior as we don't really care if the enrollment limit is
      // exceeded by one or two users. Future enrollments will still be blocked,
      // which will prompt course/institution staff to seek an increase in their
      // enrollment limit.
      if (isEnterprise()) {
        // Abuse the middleware to authorize the user for the course instance.
        req.params.course_instance_id = course_instance.id;
        await promisify(authzCourseOrInstance)(req, res);

        const didEnroll = await insertCheckedEnrollment(res, {
          institution,
          course_instance,
          authz_data: res.locals.authz_data,
        });

        if (!didEnroll) {
          // We've already been redirected to the appropriate page; do nothing.
          return;
        }
      } else {
        await queryAsync(sql.enroll, {
          course_instance_id: req.body.course_instance_id,
          user_id: res.locals.authn_user.user_id,
          req_date: res.locals.req_date,
        });
      }
      flash('success', `You have added yourself to ${courseDisplayName}.`);
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'unenroll') {
      await queryZeroOrOneRowAsync(sql.unenroll, {
        course_instance_id: req.body.course_instance_id,
        user_id: res.locals.authn_user.user_id,
        req_date: res.locals.req_date,
      });
      flash('success', `You have removed yourself from ${courseDisplayName}.`);
      res.redirect(req.originalUrl);
    } else {
      throw error.make(400, 'unknown action: ' + res.locals.__action, {
        __action: req.body.__action,
        body: req.body,
      });
    }
  }),
);

export default router;
