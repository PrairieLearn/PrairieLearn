import * as path from 'node:path';

import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import z from 'zod';

import * as sqldb from '@prairielearn/postgres';

import { CourseInstanceAccessRuleSchema, CourseInstanceSchema } from '../../../../lib/db-types.js';

const sql = sqldb.loadSql(path.join(import.meta.dirname, '..', 'queries.sql'));
const router = Router({ mergeParams: true });

const CourseInstanceAccessRuleDataSchema = z.object({
  course_instance_id: CourseInstanceSchema.shape.id,
  course_instance_short_name: CourseInstanceSchema.shape.short_name,
  course_instance_long_name: z.string(),
  course_instance_course_id: CourseInstanceSchema.shape.course_id,
  end_date: z.string().nullable(),
  course_instance_access_rule_id: CourseInstanceAccessRuleSchema.shape.id,
  institution: CourseInstanceAccessRuleSchema.shape.institution,
  course_instance_access_rule_number: CourseInstanceAccessRuleSchema.shape.number,
  start_date: z.string().nullable(),
  uids: CourseInstanceAccessRuleSchema.shape.uids,
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const accessRules = await sqldb.queryRows(
      sql.select_course_instance_access_rules,
      { course_instance_id: res.locals.course_instance.id },
      CourseInstanceAccessRuleDataSchema,
    );
    res.status(200).send(accessRules);
  }),
);

export default router;
