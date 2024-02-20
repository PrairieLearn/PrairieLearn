import { Router } from 'express';
import asyncHandler = require('express-async-handler');
import { loadSqlEquiv, queryRow, queryRows, runInTransactionAsync } from '@prairielearn/postgres';
import error = require('@prairielearn/error');
import { z } from 'zod';

import { CourseSchema } from '../../../lib/db-types';
import { CourseInstanceRowSchema, InstitutionAdminCourse } from './institutionAdminCourse.html';
import { getInstitution } from '../../lib/institution';
import { insertAuditLog } from '../../../models/audit-log';

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
      CourseInstanceRowSchema,
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
      await runInTransactionAsync(async () => {
        const updatedCourse = await queryRow(
          sql.update_enrollment_limits,
          {
            course_id: course.id,
            yearly_enrollment_limit: body.yearly_enrollment_limit || null,
            course_instance_enrollment_limit: body.course_instance_enrollment_limit || null,
          },
          CourseSchema,
        );
        await insertAuditLog({
          authn_user_id: res.locals.authn_user.user_id,
          table_name: 'pl_courses',
          action: 'update',
          institution_id: req.params.institution_id,
          course_id: req.params.course_id,
          old_state: course,
          new_state: updatedCourse,
          row_id: req.params.course_id,
        });
      });
      res.redirect(req.originalUrl);
    } else {
      throw error.make(400, `Unknown action: ${req.body.__action}`);
    }
  }),
);

export default router;
