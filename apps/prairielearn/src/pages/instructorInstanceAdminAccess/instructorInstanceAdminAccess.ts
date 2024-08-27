import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import { CourseInstanceAccessRuleSchema } from '../../lib/db-types.js';

import { InstructorInstanceAdminAccess } from './instructorInstanceAdminAccess.html.js';

const router = Router();
const sql = loadSqlEquiv(import.meta.url);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const accessRules = await queryRows(
      sql.course_instance_access_rules,
      { course_instance_id: res.locals.course_instance.id },
      CourseInstanceAccessRuleSchema,
    );

    res.send(InstructorInstanceAdminAccess({ resLocals: res.locals, accessRules }));
  }),
);

export default router;
