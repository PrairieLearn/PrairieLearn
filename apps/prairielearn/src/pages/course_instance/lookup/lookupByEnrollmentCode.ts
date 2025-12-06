import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import z from 'zod';

import { HttpStatusError } from '@prairielearn/error';

import { hasRole } from '../../../lib/authz-data-lib.js';
import { constructCourseOrInstanceContext } from '../../../lib/authz-data.js';
import type { User } from '../../../lib/db-types.js';
import { features } from '../../../lib/features/index.js';
import { selectOptionalCourseInstanceIdByEnrollmentCode } from '../../../models/course-instances.js';
import { selectCourseById } from '../../../models/course.js';
import { selectOptionalEnrollmentByUid } from '../../../models/enrollment.js';

const router = Router();

const LookupCodeSchema = z.object({
  code: z.string().min(1),
  course_instance_id: z.string().optional(),
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    if (req.accepts('html')) {
      throw new HttpStatusError(406, 'Not Acceptable');
    }

    // Parse and validate the code parameter
    const { code, course_instance_id: courseInstanceIdToCheck } = LookupCodeSchema.parse(req.query);

    const enrollmentManagementEnabled = await features.enabledFromLocals(
      'enrollment-management',
      res.locals,
    );

    // Look up the course instance by enrollment code
    const courseInstanceId = await selectOptionalCourseInstanceIdByEnrollmentCode({
      enrollment_code: code,
    });
    if (!courseInstanceId) {
      // User-facing terminology is to use "course" instead of "course instance"
      throw new HttpStatusError(404, 'No course found with this enrollment code');
    }

    if (courseInstanceIdToCheck && courseInstanceId !== courseInstanceIdToCheck) {
      throw new HttpStatusError(404, 'This enrollment code is for a different course');
    }

    const { authzData, courseInstance } = await constructCourseOrInstanceContext({
      user: res.locals.authn_user,
      course_id: null, // Inferred from course_instance_id
      course_instance_id: courseInstanceId,
      ip: req.ip ?? null,
      req_date: res.locals.req_date,
      is_administrator: res.locals.is_administrator,
    });
    if (authzData === null || courseInstance === null) {
      throw new HttpStatusError(403, 'Access denied');
    }

    if (!hasRole(authzData, ['Student'])) {
      throw new HttpStatusError(404, 'Only students can look up course instances');
    }

    const authnUser: User = res.locals.authn_user;

    const existingEnrollment = await selectOptionalEnrollmentByUid({
      uid: res.locals.authn_user.uid,
      courseInstance,
      requiredRole: ['Student'],
      authzData,
    });

    if (existingEnrollment) {
      if (!['invited', 'rejected', 'joined', 'removed'].includes(existingEnrollment.status)) {
        throw new HttpStatusError(403, 'You are blocked from accessing this course');
      }

      // If the user was invited, joined, or removed, return the course instance ID.
      if (['invited', 'joined', 'removed'].includes(existingEnrollment.status)) {
        res.json({
          course_instance_id: courseInstance.id,
        });
        return;
      }

      // Otherwise, fall through to the self-enrollment checks.
    }

    // Check if self-enrollment is enabled for this course instance
    if (!courseInstance.self_enrollment_enabled) {
      throw new HttpStatusError(403, 'Self-enrollment is disabled for this course');
    }

    if (
      enrollmentManagementEnabled &&
      courseInstance.self_enrollment_restrict_to_institution &&
      // The default value for self-enrollment restriction is true.
      // In the old system (before publishing was introduced), the default was false.
      // So if publishing is not set up, we should ignore the restriction.
      courseInstance.modern_publishing
    ) {
      // Lookup the course
      const course = await selectCourseById(courseInstance.course_id);
      if (course.institution_id !== authnUser.institution_id) {
        throw new HttpStatusError(
          403,
          'Self-enrollment is restricted to users from the same institution',
        );
      }
    }

    if (
      courseInstance.self_enrollment_enabled_before_date &&
      new Date() >= courseInstance.self_enrollment_enabled_before_date
    ) {
      throw new HttpStatusError(403, 'Self-enrollment is no longer allowed for this course');
    }

    // Return the course instance ID
    res.json({
      course_instance_id: courseInstance.id,
    });
  }),
);

export default router;
