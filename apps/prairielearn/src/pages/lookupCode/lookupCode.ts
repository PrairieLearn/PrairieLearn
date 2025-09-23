import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import z from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';

import { CourseInstanceSchema } from '../../lib/db-types.js';

const router = Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

const LookupCodeSchema = z.object({
  code: z.string().min(1).max(255),
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    // Parse and validate the code parameter
    const { code } = LookupCodeSchema.parse(req.query);

    // Look up the course instance by enrollment code
    const courseInstance = await sqldb.queryRow(
      sql.select_course_instance_by_enrollment_code,
      { enrollment_code: code },
      CourseInstanceSchema.nullable(),
    );

    if (!courseInstance) {
      throw new HttpStatusError(404, 'Course instance not found');
    }

    // Check if self-enrollment is enabled for this course instance
    if (!courseInstance.self_enrollment_enabled) {
      throw new HttpStatusError(403, 'Self-enrollment is not enabled for this course');
    }

    // Check if enrollment code is required and if it's enabled
    if (courseInstance.self_enrollment_use_enrollment_code && !code) {
      throw new HttpStatusError(400, 'Enrollment code is required');
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
