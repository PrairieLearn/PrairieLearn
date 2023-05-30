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
  runInTransactionAsync,
} from '@prairielearn/postgres';

import { InstitutionSchema, CourseInstanceSchema } from '../../lib/db-types';
import {
  Enroll,
  EnrollLtiMessage,
  CourseInstanceRowSchema,
  EnrollmentLimitExceededMessage,
} from './enroll.html';

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
      CourseInstanceRowSchema
    );
    res.send(Enroll({ courseInstances, resLocals: res.locals }));
  })
);

router.get(
  '/limit_exceeded',
  asyncHandler((req, res) => {
    res.status(403).send(EnrollmentLimitExceededMessage({ resLocals: res.locals }));
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (res.locals.authn_provider_name === 'LTI') {
      throw error.make(400, 'Enrollment unavailable, managed via LTI');
    }

    if (req.body.__action === 'enroll') {
      const limitExceeded = await runInTransactionAsync(async () => {
        const {
          institution,
          course_instance,
          institution_enrollment_count,
          course_instance_enrollment_count,
        } = await queryRow(
          sql.select_and_lock_enrollment_counts,
          { course_instance_id: req.body.course_instance_id },
          z.object({
            institution: InstitutionSchema,
            course_instance: CourseInstanceSchema,
            institution_enrollment_count: z.number(),
            course_instance_enrollment_count: z.number(),
          })
        );

        const yearlyEnrollmentLimit = institution.yearly_enrollment_limit;
        const courseInstanceEnrollmentLimit =
          course_instance.enrollment_limit ?? institution.course_instance_enrollment_limit;

        if (
          institution_enrollment_count + 1 > yearlyEnrollmentLimit ||
          course_instance_enrollment_count + 1 > courseInstanceEnrollmentLimit
        ) {
          return true;
        }

        // No limits would be exceeded, so we can enroll the user.
        await queryAsync(sql.enroll, {
          course_instance_id: req.body.course_instance_id,
          user_id: res.locals.authn_user.user_id,
          req_date: res.locals.req_date,
        });
      });

      if (limitExceeded) {
        // We would exceed an enrollment limit. We won't share any specific
        // details here. In the future, course staff will be able to check
        // their enrollment limits for themselves.
        res.redirect('/pl/enroll/limit_exceeded');
        return;
      }

      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'unenroll') {
      await queryZeroOrOneRowAsync(sql.unenroll, {
        course_instance_id: req.body.course_instance_id,
        user_id: res.locals.authn_user.user_id,
        req_date: res.locals.req_date,
      });
      res.redirect(req.originalUrl);
    } else {
      throw error.make(400, 'unknown action: ' + res.locals.__action, {
        __action: req.body.__action,
        body: req.body,
      });
    }
  })
);

export default router;
