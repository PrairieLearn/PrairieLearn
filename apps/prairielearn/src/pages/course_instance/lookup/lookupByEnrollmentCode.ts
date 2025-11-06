import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import z from 'zod';

import { HttpStatusError } from '@prairielearn/error';

import { hasRole } from '../../../lib/authz-data-lib.js';
import { constructCourseOrInstanceContext } from '../../../lib/authz-data.js';
import type { User } from '../../../lib/db-types.js';
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
    // Parse and validate the code parameter
    const { code, course_instance_id: courseInstanceIdToCheck } = LookupCodeSchema.parse(req.query);

    // Look up the course instance by enrollment code
    const courseInstanceId = await selectOptionalCourseInstanceIdByEnrollmentCode({
      enrollment_code: code,
    });
    if (!courseInstanceId) {
      // User-facing terminology is to use "course" instead of "course instance"
      res.status(404).json({
        error: 'No course found with this enrollment code',
      });
      return;
    }

    if (courseInstanceIdToCheck && courseInstanceId !== courseInstanceIdToCheck) {
      res.status(404).json({
        error: 'This enrollment code is for a different course',
      });
      return;
    }

    const { authzData, courseInstance } = await constructCourseOrInstanceContext({
      user: res.locals.authn_user,
      course_id: null, // Inferred via course_instance_id
      course_instance_id: courseInstanceId,
      ip: req.ip ?? null,
      req_date: res.locals.req_date,
      is_administrator: res.locals.is_administrator,
    });
    if (authzData === null || courseInstance === null) {
      throw new HttpStatusError(403, 'Access denied');
    }

    if (!hasRole(authzData, 'Student')) {
      res.status(404).json({
        error: 'Only students can look up course instances',
      });
      return;
    }

    const authnUser: User = res.locals.authn_user;

    const existingEnrollment = await selectOptionalEnrollmentByUid({
      uid: res.locals.authn_user.uid,
      courseInstance,
      requestedRole: 'Student',
      authzData,
    });

    if (existingEnrollment) {
      if (!['invited', 'rejected', 'joined', 'removed'].includes(existingEnrollment.status)) {
        res.status(403).json({
          error: 'You are blocked from accessing this course',
        });
        return;
      } else {
        // If the user had some other prior enrollment state, return the course instance ID.
        res.json({
          course_instance_id: courseInstance.id,
        });
        return;
      }
    }

    // Check if self-enrollment is enabled for this course instance
    if (!courseInstance.self_enrollment_enabled) {
      res.status(403).json({
        error: 'Self-enrollment is disabled for this course',
      });
      return;
    }

    if (courseInstance.self_enrollment_restrict_to_institution) {
      // Lookup the course
      const course = await selectCourseById(courseInstance.course_id);
      if (course.institution_id !== authnUser.institution_id) {
        res.status(403).json({
          error: 'Self-enrollment is restricted to users from the same institution',
        });
        return;
      }
    }

    if (
      courseInstance.self_enrollment_enabled_before_date &&
      new Date() >= courseInstance.self_enrollment_enabled_before_date
    ) {
      res.status(403).json({
        error: 'Self-enrollment is no longer allowed for this course',
      });
      return;
    }

    // Return the course instance ID
    res.json({
      course_instance_id: courseInstance.id,
    });
  }),
);

export default router;
