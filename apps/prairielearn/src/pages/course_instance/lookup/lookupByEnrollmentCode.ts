import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import z from 'zod';

import { dangerousFullAuthzForTesting } from '../../../lib/authzData.js';
import type { User } from '../../../lib/db-types.js';
import { selectOptionalCourseInstanceByEnrollmentCode } from '../../../models/course-instances.js';
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
    const { code, course_instance_id: courseInstanceId } = LookupCodeSchema.parse(req.query);

    // Look up the course instance by enrollment code
    const courseInstance = await selectOptionalCourseInstanceByEnrollmentCode(code);

    // User-facing terminology is to use "course" instead of "course instance"

    if (!courseInstance) {
      res.status(404).json({
        error: 'No course found with this enrollment code',
      });
      return;
    }

    if (courseInstanceId && courseInstance.id !== courseInstanceId) {
      res.status(404).json({
        error: 'This enrollment code is for a different course',
      });
      return;
    }

    const authnUser: User = res.locals.authn_user;

    const existingEnrollment = await selectOptionalEnrollmentByUid({
      uid: res.locals.authn_user.uid,
      courseInstance,
      requestedRole: 'Student', // TODO: Should be 'System'
      authzData: dangerousFullAuthzForTesting(),
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
