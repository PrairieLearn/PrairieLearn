import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import { loadSqlEquiv, queryOptionalRow, queryRows } from '@prairielearn/postgres';

import { IdSchema, UserSchema } from '../../lib/db-types.js';
import { courseInstanceFilenamePrefix } from '../../lib/sanitize-name.js';

import { StudentDetail } from './studentDetail.html.js';

const router = Router();
const sql = loadSqlEquiv(import.meta.url);

const StudentDetailUserSchema = z.object({
  user: UserSchema,
  role: z.string(),
  enrollment_date: z.string().nullable(),
});

const StudentAssessmentRowSchema = z.object({
  assessment_id: IdSchema,
  assessment_instance_id: IdSchema.nullable(),
  assessment_set_heading: z.string(),
  assessment_set_color: z.string(),
  assessment_title: z.string(),
  assessment_number: z.string(),
  assessment_label: z.string(),
  score_perc: z.number().nullable(),
  max_points: z.number().nullable(),
  points: z.number().nullable(),
  show_closed_assessment_score: z.boolean(),
  assessment_group_work: z.boolean(),
});

router.get(
  '/:user_id(\\d+)',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_instance_permission_view) {
      throw new HttpStatusError(403, 'Access denied (must be a student data viewer)');
    }

    const student = await queryOptionalRow(
      sql.select_student_info,
      {
        user_id: req.params.user_id,
        course_instance_id: res.locals.course_instance.id,
      },
      StudentDetailUserSchema,
    );

    if (!student) {
      throw new HttpStatusError(404, 'Student not found');
    }

    const assessments = await queryRows(
      sql.select_student_assessments,
      {
        user_id: req.params.user_id,
        course_instance_id: res.locals.course_instance.id,
        authz_data: res.locals.authz_data,
        req_date: res.locals.req_date,
      },
      StudentAssessmentRowSchema,
    );

    const csvFilename =
      courseInstanceFilenamePrefix(res.locals.course_instance, res.locals.course) + 'gradebook.csv';

    res.send(
      StudentDetail({
        resLocals: res.locals,
        student,
        assessments,
        csvFilename,
      }),
    );
  }),
);

export default router;
