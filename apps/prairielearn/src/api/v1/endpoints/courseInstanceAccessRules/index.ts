import * as path from 'node:path';

import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import z from 'zod';

import { formatDateISO } from '@prairielearn/formatter';
import * as sqldb from '@prairielearn/postgres';

import { CourseInstanceAccessRuleSchema, CourseInstanceSchema } from '../../../../lib/db-types.js';

const sql = sqldb.loadSql(path.join(import.meta.dirname, '..', 'queries.sql'));
const router = Router({ mergeParams: true });

const CourseInstanceAccessRuleDataSchema = z
  .object({
    course_instance_id: CourseInstanceSchema.shape.id,
    course_instance_short_name: CourseInstanceSchema.shape.short_name,
    course_instance_long_name: z.string(),
    course_instance_course_id: CourseInstanceSchema.shape.course_id,
    display_timezone: CourseInstanceSchema.shape.display_timezone,
    end_date: CourseInstanceAccessRuleSchema.shape.end_date,
    course_instance_access_rule_id: CourseInstanceAccessRuleSchema.shape.id,
    institution: CourseInstanceAccessRuleSchema.shape.institution,
    course_instance_access_rule_number: CourseInstanceAccessRuleSchema.shape.number,
    start_date: CourseInstanceAccessRuleSchema.shape.start_date,
    uids: CourseInstanceAccessRuleSchema.shape.uids,
  })
  .transform(({ start_date, end_date, display_timezone, ...rule }) => ({
    ...rule,
    start_date: formatDateISO(start_date, display_timezone),
    end_date: formatDateISO(end_date, display_timezone),
  }));

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
