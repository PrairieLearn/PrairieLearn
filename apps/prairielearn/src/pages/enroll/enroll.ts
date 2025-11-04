import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import { loadSqlEquiv, queryRow, queryRows } from '@prairielearn/postgres';
import { run } from '@prairielearn/run';

import { dangerousFullSystemAuthz } from '../../lib/authz-data-lib.js';
import { buildAuthzData } from '../../lib/authz-data.js';
import { features } from '../../lib/features/index.js';
import forbidAccessInExamMode from '../../middlewares/forbidAccessInExamMode.js';
import { ensureCheckedEnrollment, selectOptionalEnrollmentByUid } from '../../models/enrollment.js';

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
    if (req.body.__action === 'enroll') {
      const { authzData, authzCourseInstance, authzInstitution, authzCourse } =
        await buildAuthzData({
          authn_user: res.locals.authn_user,
          course_id: null,
          course_instance_id: req.body.course_instance_id,
          is_administrator: res.locals.is_administrator,
          ip: req.ip ?? null,
          req_date: res.locals.req_date,
        });

      if (authzCourseInstance == null) {
        throw new error.HttpStatusError(403, 'Access denied');
      }

      const existingEnrollment = await run(async () => {
        return await selectOptionalEnrollmentByUid({
          uid: res.locals.authn_user.uid,
          courseInstance: authzCourseInstance,
          requestedRole: 'System',
          authzData: dangerousFullSystemAuthz(),
        });
      });

      const enrollmentManagementEnabled = await features.enabledFromLocals(
        'enrollment-management',
        res.locals,
      );
      const selfEnrollmentEnabled = authzCourseInstance.self_enrollment_enabled;
      const selfEnrollmentExpired =
        authzCourseInstance.self_enrollment_enabled_before_date != null &&
        new Date() >= authzCourseInstance.self_enrollment_enabled_before_date;

      const institutionRestrictionSatisfied =
        res.locals.authn_user.institution_id === authzInstitution.id ||
        !enrollmentManagementEnabled ||
        !authzCourseInstance.self_enrollment_restrict_to_institution;

      const canJoin =
        existingEnrollment != null &&
        ['joined', 'invited', 'rejected', 'removed'].includes(existingEnrollment.status);

      if (
        (existingEnrollment == null &&
          (!selfEnrollmentEnabled || !selfEnrollmentExpired || !institutionRestrictionSatisfied)) ||
        !canJoin
      ) {
        // On the homepage, we show nice error pages. Here, we will just redirect them back to the homepage.
        // This is because the enroll page is going away.
        flash('error', 'You cannot enroll in this course.');
        res.redirect(req.originalUrl);
        return;
      }

      await ensureCheckedEnrollment({
        institution: authzInstitution,
        course: authzCourse,
        courseInstance: authzCourseInstance,
        requestedRole: 'Student',
        authzData,
        actionDetail: 'explicit_joined',
      });

      const courseDisplayName = `${authzCourse.short_name}: ${authzCourse.title}, ${authzCourseInstance.long_name}`;
      flash('success', `You have joined ${courseDisplayName}.`);
      res.redirect(req.originalUrl);
    } else {
      throw new error.HttpStatusError(400, 'unknown action: ' + req.body.__action);
    }
  }),
]);

export default router;
