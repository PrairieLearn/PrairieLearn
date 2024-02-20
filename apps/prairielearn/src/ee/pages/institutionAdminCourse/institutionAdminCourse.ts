import { Router } from 'express';
import asyncHandler = require('express-async-handler');
import { loadSqlEquiv, queryAsync, queryRow, queryRows } from '@prairielearn/postgres';
import error = require('@prairielearn/error');
import { z } from 'zod';

import { CourseInstanceSchema, CourseSchema } from '../../../lib/db-types';
import { InstitutionAdminCourse } from './institutionAdminCourse.html';
import { getInstitution } from '../../lib/institution';

const sql = loadSqlEquiv(__filename);
const router = Router({ mergeParams: true });

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const institution = await getInstitution(req.params.institution_id);
    const course = await queryRow(
      sql.select_course,
      {
        institution_id: req.params.institution_id,
        course_id: req.params.course_id,
      },
      CourseSchema,
    );
    const courseInstances = await queryRows(
      sql.select_course_instances,
      {
        institution_id: req.params.institution_id,
        course_id: req.params.course_id,
      },
      CourseInstanceSchema,
    );
    res.send(
      InstitutionAdminCourse({
        institution,
        course,
        course_instances: courseInstances,
        resLocals: res.locals,
      }),
    );
  }),
);

const UpdateEnrollmentLimitsBodySchema = z.object({
  __action: z.literal('update_enrollment_limits'),
  yearly_enrollment_limit: z.union([z.literal(''), z.coerce.number().int()]),
  course_instance_enrollment_limit: z.union([z.literal(''), z.coerce.number().int()]),
});

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const course = await queryRow(
      sql.select_course,
      {
        institution_id: req.params.institution_id,
        course_id: req.params.course_id,
      },
      CourseSchema,
    );

    if (req.body.__action === 'update_enrollment_limits') {
      const body = UpdateEnrollmentLimitsBodySchema.parse(req.body);
      await queryAsync(sql.update_enrollment_limits, {
        course_id: course.id,
        yearly_enrollment_limit: body.yearly_enrollment_limit || null,
        course_instance_enrollment_limit: body.course_instance_enrollment_limit || null,
      });
      res.redirect(req.originalUrl);
    } else {
      throw error.make(400, `Unknown action: ${req.body.__action}`);
    }
  }),
);

export default router;
