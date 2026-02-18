import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import z from 'zod';

import * as sqldb from '@prairielearn/postgres';

import {
  AssessmentInstanceSchema,
  AssessmentSchema,
  AssessmentSetSchema,
  UserSchema,
} from '../../../../lib/db-types.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);
const router = Router({ mergeParams: true });

const GradebookDataSchema = z.object({
  user_id: UserSchema.shape.id,
  user_uid: UserSchema.shape.uid,
  user_uin: UserSchema.shape.uin,
  user_name: UserSchema.shape.name,
  user_role: z.string(),
  assessments: z.array(
    z.object({
      assessment_id: AssessmentSchema.shape.id,
      assessment_name: AssessmentSchema.shape.tid,
      assessment_label: z.string(),
      assessment_set_abbreviation: AssessmentSetSchema.shape.abbreviation,
      assessment_number: AssessmentSchema.shape.number,
      // left join course_scores table
      score_perc: AssessmentInstanceSchema.shape.score_perc.nullable(),
      max_points: AssessmentInstanceSchema.shape.max_points.nullable(),
      points: AssessmentInstanceSchema.shape.points.nullable(),
      start_date: z.string().nullable(),
      duration_seconds: z.number().nullable(),
      assessment_instance_id: AssessmentInstanceSchema.shape.id.nullable(),
    }),
  ),
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const data = await sqldb.queryRows(
      sql.select_user_scores,
      { course_instance_id: res.locals.course_instance.id },
      GradebookDataSchema,
    );
    res.status(200).send(data);
  }),
);

export default router;
