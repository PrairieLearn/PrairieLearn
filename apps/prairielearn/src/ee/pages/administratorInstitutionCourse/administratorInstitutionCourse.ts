import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import { loadSqlEquiv, queryRow, queryRows, runInTransactionAsync } from '@prairielearn/postgres';

import { CourseSchema } from '../../../lib/db-types.js';
import { insertAuditLog } from '../../../models/audit-log.js';
import { getInstitution } from '../../lib/institution.js';

import {
  CourseInstanceRowSchema,
  AdministratorInstitutionCourse,
} from './administratorInstitutionCourse.html.js';

const sql = loadSqlEquiv(import.meta.url);
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
    const rows = await queryRows(
      sql.select_course_instances,
      { course_id: course.id },
      CourseInstanceRowSchema,
    );
    res.send(
      AdministratorInstitutionCourse({
        institution,
        course,
        rows,
        resLocals: res.locals,
      }),
    );
  }),
);

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
      const body = z
        .object({
          __action: z.literal('update_enrollment_limits'),
          yearly_enrollment_limit: z.union([
            z.literal('').transform(() => null),
            z.coerce.number().int(),
          ]),
          course_instance_enrollment_limit: z.union([
            z.literal('').transform(() => null),
            z.coerce.number().int(),
          ]),
        })
        .parse(req.body);
      await runInTransactionAsync(async () => {
        const updatedCourse = await queryRow(
          sql.update_enrollment_limits,
          {
            course_id: course.id,
            yearly_enrollment_limit: body.yearly_enrollment_limit,
            course_instance_enrollment_limit: body.course_instance_enrollment_limit,
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
      throw new error.HttpStatusError(400, `Unknown action: ${req.body.__action}`);
    }
  }),
);

export default router;
