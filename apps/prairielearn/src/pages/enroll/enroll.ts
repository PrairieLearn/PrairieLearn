import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import { loadSqlEquiv, queryRow, queryRows } from '@prairielearn/postgres';
import { run } from '@prairielearn/run';

import { dangerousFullSystemAuthz } from '../../lib/authz-data-lib.js';
import { constructCourseOrInstanceContext } from '../../lib/authz-data.js';
import { features } from '../../lib/features/index.js';
import forbidAccessInExamMode from '../../middlewares/forbidAccessInExamMode.js';
import { ensureEnrollment, selectOptionalEnrollmentByUid } from '../../models/enrollment.js';

import {
  CourseInstanceRowSchema,
  Enroll,
  EnrollLtiMessage,
  EnrollmentLimitExceededMessage,
} from './enroll.html.js';

const router = Router();
const sql = loadSqlEquiv(import.meta.url);

router.get('/', [
  // If a student gains control of a course, they could update the course
  // title to contain arbitrary information and use the enrollment page to
  // access that during a CBTF exam. We'll block access to prevent this.
  forbidAccessInExamMode,
  asyncHandler(async (req, res) => {
    if (res.locals.authn_provider_name === 'LTI') {
      const ltiInfo = await queryRow(
        sql.lti_course_instance_lookup,
        { course_instance_id: res.locals.authn_user.lti_course_instance_id },
        z.object({
          plc_short_name: z.string(),
          ci_long_name: z.string(),
        }),
      );
      res.send(EnrollLtiMessage({ ltiInfo, resLocals: res.locals }));
      return;
    }

    const courseInstances = await queryRows(
      sql.select_course_instances_legacy_access,
      {
        user_id: res.locals.authn_user.id,
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
    if (req.body.__action === 'enroll') {
      const { authzData, courseInstance, institution, course } =
        await constructCourseOrInstanceContext({
          user: res.locals.authn_user,
          course_id: null,
          course_instance_id: req.body.course_instance_id,
          ip: req.ip ?? null,
          req_date: res.locals.req_date,
          is_administrator: res.locals.is_administrator,
        });

      if (courseInstance == null) {
        throw new error.HttpStatusError(403, 'Access denied');
      }

      const existingEnrollment = await run(async () => {
        return await selectOptionalEnrollmentByUid({
          uid: res.locals.authn_user.uid,
          courseInstance,
          requiredRole: ['System'],
          authzData: dangerousFullSystemAuthz(),
        });
      });

      const enrollmentManagementEnabled = await features.enabledFromLocals(
        'enrollment-management',
        res.locals,
      );
      const selfEnrollmentEnabled = courseInstance.self_enrollment_enabled;
      const selfEnrollmentExpired =
        courseInstance.self_enrollment_enabled_before_date != null &&
        new Date() >= courseInstance.self_enrollment_enabled_before_date;

      const institutionRestrictionSatisfied =
        res.locals.authn_user.institution_id === institution.id ||
        !enrollmentManagementEnabled ||
        !courseInstance.self_enrollment_restrict_to_institution ||
        !courseInstance.modern_publishing;

      const canRejoin =
        existingEnrollment != null &&
        ['joined', 'invited', 'rejected', 'removed'].includes(existingEnrollment.status);

      const canSelfEnroll =
        selfEnrollmentEnabled && !selfEnrollmentExpired && institutionRestrictionSatisfied;

      if (
        (existingEnrollment == null && !canSelfEnroll) ||
        (existingEnrollment != null && !canRejoin)
      ) {
        // On the homepage, we show nice error pages. Here, we will just redirect them back to the homepage.
        // This is because the enroll page is going away.
        flash('error', 'You cannot enroll in this course.');
        res.redirect(req.originalUrl);
        return;
      }

      await ensureEnrollment({
        institution,
        course,
        courseInstance,
        requiredRole: ['Student'],
        authzData,
        actionDetail: 'explicit_joined',
      });

      const courseDisplayName = `${course.short_name}: ${course.title}, ${courseInstance.long_name}`;
      flash('success', `You have joined ${courseDisplayName}.`);
      res.redirect(req.originalUrl);
    } else {
      throw new error.HttpStatusError(400, 'unknown action: ' + req.body.__action);
    }
  }),
]);

export default router;
