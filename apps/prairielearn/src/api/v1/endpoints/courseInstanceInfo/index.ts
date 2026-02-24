import * as path from 'node:path';

import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import z from 'zod';

import * as sqldb from '@prairielearn/postgres';

import { CourseInstanceSchema, CourseSchema } from '../../../../lib/db-types.js';

const sql = sqldb.loadSql(path.join(import.meta.dirname, '..', 'queries.sql'));
const router = Router({ mergeParams: true });

const CourseInstanceInfoDataSchema = z.object({
  course_instance_id: CourseInstanceSchema.shape.id,
  course_instance_long_name: CourseInstanceSchema.shape.long_name,
  course_instance_short_name: CourseInstanceSchema.shape.short_name,
  course_instance_course_id: CourseInstanceSchema.shape.course_id,
  display_timezone: CourseInstanceSchema.shape.display_timezone,
  deleted_at: z.string().nullable(),
  course_title: CourseSchema.shape.title,
  course_short_name: CourseSchema.shape.short_name,
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const data = await sqldb.queryRow(
      sql.select_course_instance_info,
      { course_instance_id: res.locals.course_instance.id },
      CourseInstanceInfoDataSchema,
    );
    res.status(200).send(data);
  }),
);

export default router;
