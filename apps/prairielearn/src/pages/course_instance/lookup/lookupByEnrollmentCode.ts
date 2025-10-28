import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import z from 'zod';

import { HttpStatusError } from '@prairielearn/error';

import { dangerousFullSystemAuthz, hasRole } from '../../../lib/authzData.js';
import { buildAuthzData } from '../../../lib/authzDataPublishing.js';
import { selectOptionalCourseInstanceByEnrollmentCode } from '../../../models/course-instances.js';

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
    const courseInstance = await selectOptionalCourseInstanceByEnrollmentCode({
      enrollment_code: code,
      requestedRole: 'System',
      authzData: dangerousFullSystemAuthz(),
    });
    if (!courseInstance) {
      // User-facing terminology is to use "course" instead of "course instance"
      res.status(404).json({
        error: 'No course found with this enrollment code',
      });
      return;
    }

    const { authzData } = await buildAuthzData({
      authn_user: res.locals.authn_user,
      course_id: null, // Inferred via course_instance_id
      course_instance_id: courseInstanceId ?? null,
      is_administrator: res.locals.is_administrator,
      ip: req.ip ?? null,
      req_date: res.locals.req_date,
    });
    if (authzData === null) {
      throw new HttpStatusError(403, 'Access denied');
    }

    if (!hasRole(authzData, 'Student')) {
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
    });
  }),
);

export default router;
