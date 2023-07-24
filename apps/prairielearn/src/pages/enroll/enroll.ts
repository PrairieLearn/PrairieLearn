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

import { InstitutionSchema, CourseInstanceSchema, CourseSchema } from '../../lib/db-types';
import {
  Enroll,
  EnrollLtiMessage,
  CourseInstanceRowSchema,
  EnrollmentLimitExceededMessage,
} from './enroll.html';
import { isEnterprise } from '../../lib/license';

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

    if (req.body.__action === 'enroll') {
      const limitExceeded = await runInTransactionAsync(async () => {
        // Enrollment limits can only be configured on enterprise instances, so
        // we'll also only check and enforce the limits on enterprise instances.
        if (isEnterprise()) {
          const { course, course_instance } = await queryRow(
            sql.select_course_instance,
            { course_instance_id: req.body.course_instance_id },
            z.object({
              course: CourseSchema,
              course_instance: CourseInstanceSchema,
            }),
          );
          const institution = await queryRow(
            sql.select_and_lock_institution,
            { institution_id: course.institution_id },
            InstitutionSchema,
          );

          const enrollmentCounts = await queryRows(
            sql.select_enrollment_counts,
            {
              institution_id: institution.id,
              course_instance_id: req.body.course_instance_id,
            },
            z.object({
              kind: z.enum(['free', 'paid']),
              course_instance_enrollment_count: z.number().nullable(),
              institution_enrollment_count: z.number().nullable(),
            }),
          );

          const freeEnrollmentCounts = enrollmentCounts.find((ec) => ec.kind === 'free');
          const paidEnrollmentCounts = enrollmentCounts.find((ec) => ec.kind === 'paid');
          const freeInstitutionEnrollmentCount =
            freeEnrollmentCounts?.institution_enrollment_count ?? 0;
          const freeCourseInstanceEnrollmentCount =
            freeEnrollmentCounts?.course_instance_enrollment_count ?? 0;
          const paidInstitutionEnrollmentCount =
            paidEnrollmentCounts?.institution_enrollment_count ?? 0;
          const paidCourseInstanceEnrollmentCount =
            paidEnrollmentCounts?.course_instance_enrollment_count ?? 0;

          // TODO: fix
          const institution_enrollment_count = 1;
          const course_instance_enrollment_count = 1;

          const yearlyEnrollmentLimit = institution.yearly_enrollment_limit;
          const courseInstanceEnrollmentLimit =
            course_instance.enrollment_limit ?? institution.course_instance_enrollment_limit;

          if (
            freeInstitutionEnrollmentCount + 1 > yearlyEnrollmentLimit ||
            freeCourseInstanceEnrollmentCount + 1 > courseInstanceEnrollmentLimit
          ) {
            return true;
          }
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
  }),
);

export default router;
