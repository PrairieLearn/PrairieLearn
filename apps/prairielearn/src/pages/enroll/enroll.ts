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

import { InstitutionSchema, CourseInstanceSchema } from '../../lib/db-types';
import {
  Enroll,
  EnrollLtiMessage,
  CourseInstanceRowSchema,
  EnrollmentLimitExceededMessage,
} from './enroll.html';
import { isEnterprise } from '../../lib/license';
import {
  getEnrollmentCountsForCourseInstance,
  getEnrollmentCountsForInstitution,
} from '../../ee/models/enrollment';

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
      let limitExceeded = false;

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
        const { institution, course_instance } = await queryRow(
          sql.select_course_instance,
          { course_instance_id: req.body.course_instance_id },
          z.object({
            institution: InstitutionSchema,
            course_instance: CourseInstanceSchema,
          }),
        );

        const institutionEnrollmentCounts = await getEnrollmentCountsForInstitution({
          institution_id: institution.id,
          created_since: '1 year',
        });
        const courseInstanceEnrollmentCounts = await getEnrollmentCountsForCourseInstance(
          req.body.course_instance_id,
        );

        const freeInstitutionEnrollmentCount = institutionEnrollmentCounts.free;
        const freeCourseInstanceEnrollmentCount = courseInstanceEnrollmentCounts.free;

        const yearlyEnrollmentLimit = institution.yearly_enrollment_limit;
        const courseInstanceEnrollmentLimit =
          course_instance.enrollment_limit ?? institution.course_instance_enrollment_limit;

        if (
          freeInstitutionEnrollmentCount + 1 > yearlyEnrollmentLimit ||
          freeCourseInstanceEnrollmentCount + 1 > courseInstanceEnrollmentLimit
        ) {
          limitExceeded = true;
        }
      }

      if (!limitExceeded) {
        // No limits would be exceeded, so we can enroll the user.
        await queryAsync(sql.enroll, {
          course_instance_id: req.body.course_instance_id,
          user_id: res.locals.authn_user.user_id,
          req_date: res.locals.req_date,
        });
        res.redirect(req.originalUrl);
      } else {
        // We would exceed an enrollment limit. We won't share any specific
        // details here. In the future, course staff will be able to check
        // their enrollment limits for themselves.
        res.redirect('/pl/enroll/limit_exceeded');
      }
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
