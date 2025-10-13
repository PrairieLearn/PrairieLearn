import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import z from 'zod';

import { selectOptionalCourseInstanceByEnrollmentCode } from '../../../models/course-instances.js';

const router = Router();

const LookupCodeSchema = z.object({
  code: z.string(),
  course_instance_id: z.string().optional(),
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    // Parse and validate the code parameter
    const { code, course_instance_id: courseInstanceId } = LookupCodeSchema.parse(req.query);

    if (!code) {
      res.status(400).json({
        error: 'Enrollment code is required',
      });
      return;
    }

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
        error: 'No course found with this enrollment code',
      });
      return;
    }

    // Check if self-enrollment is enabled for this course instance
    if (!courseInstance.self_enrollment_enabled) {
      res.status(403).json({
        error: 'Self-enrollment is not enabled for this course',
      });
      return;
    }

    // Return the course instance ID
    res.json({
      course_instance_id: courseInstance.id,
      course_instance_name: courseInstance.long_name,
      course_short_name: courseInstance.short_name,
    });
  }),
);

export default router;
