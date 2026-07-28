import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import z from 'zod';

import { HttpStatusError } from '@prairielearn/error';

import { hasRole } from '../../../lib/authz-data-lib.js';
import { constructCourseOrInstanceContext } from '../../../lib/authz-data.js';
import type { User } from '../../../lib/db-types.js';
import { getEligibilityErrorMessage } from '../../../lib/enrollment-eligibility.js';
import { selectCourseInstanceAdmissionPlan } from '../../../models/course-instance-admission.js';
import { selectOptionalCourseInstanceIdByEnrollmentCode } from '../../../models/course-instances.js';

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

    // Look up the course instance by enrollment code
    const courseInstanceId = await selectOptionalCourseInstanceIdByEnrollmentCode({
      enrollmentCode: code,
    });
    if (!courseInstanceId) {
      // User-facing terminology is to use "course" instead of "course instance"
      throw new HttpStatusError(404, 'No course found with this enrollment code');
    }

    if (courseInstanceIdToCheck && courseInstanceId !== courseInstanceIdToCheck) {
      throw new HttpStatusError(404, 'This enrollment code is for a different course');
    }

    const { authzData, course, courseInstance } = await constructCourseOrInstanceContext({
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
    const admissionPlan = await selectCourseInstanceAdmissionPlan({
      course,
      courseInstance,
      enrollmentCode: code,
      user: authnUser,
    });

    if (admissionPlan.type === 'blocked') {
      throw new HttpStatusError(403, getEligibilityErrorMessage('blocked'));
    }
    if (admissionPlan.type === 'ineligible') {
      throw new HttpStatusError(403, getEligibilityErrorMessage(admissionPlan.reason));
    }

    // Return the course instance ID
    res.json({
      course_instance_id: courseInstance.id,
    });
  }),
);

export default router;
