import { Router } from 'express';
import { z } from 'zod';

import { loadSqlEquiv, queryRow, queryRows, runInTransactionAsync } from '@prairielearn/postgres';
import {
  IdSchema,
  IntegerFromStringOrEmptySchema,
  parseRequest,
  parseRequestParams,
} from '@prairielearn/zod';

import { CourseSchema } from '../../../lib/db-types.js';
import { typedAsyncHandler } from '../../../lib/res-locals.js';
import { insertAuditLog } from '../../../models/audit-log.js';
import { getInstitution } from '../../lib/institution.js';

import {
  AdministratorInstitutionCourse,
  CourseInstanceRowSchema,
} from './administratorInstitutionCourse.html.js';

const sql = loadSqlEquiv(import.meta.url);
const router = Router({ mergeParams: true });

const ParamsSchema = z.object({
  institution_id: IdSchema,
  course_id: IdSchema,
});

const PostRequestSchemas = {
  params: ParamsSchema,
  body: z.object({
    yearly_enrollment_limit: IntegerFromStringOrEmptySchema,
    course_instance_enrollment_limit: IntegerFromStringOrEmptySchema,
  }),
};

router.get(
  '/',
  typedAsyncHandler<'plain'>(async (req, res) => {
    const params = parseRequestParams(req, ParamsSchema);

    const institution = await getInstitution(params.institution_id);
    const course = await queryRow(
      sql.select_course,
      {
        institution_id: params.institution_id,
        course_id: params.course_id,
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
  typedAsyncHandler<'plain'>(async (req, res) => {
    const { params, body } = parseRequest(req, PostRequestSchemas);
    const course = await queryRow(
      sql.select_course,
      {
        institution_id: params.institution_id,
        course_id: params.course_id,
      },
      CourseSchema,
    );

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
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      await insertAuditLog({
        authn_user_id: res.locals.authn_user.id,
        table_name: 'courses',
        action: 'update',
        institution_id: params.institution_id,
        course_id: params.course_id,
        old_state: course,
        new_state: updatedCourse,
        row_id: params.course_id,
      });
    });
    res.redirect(req.originalUrl);
  }),
);

export default router;
