// @ts-check
import * as express from 'express';
import asyncHandler = require('express-async-handler');
import { z } from 'zod';
import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import { config } from '../../lib/config';
import { InstructorAssessmentAccess } from './instructorAssessmentAccess.html';

const router = express.Router();
const sql = loadSqlEquiv(__filename);

const AssessmentAccessRulesSchema = z.object({
  mode: z.string(),
  uids: z.string(),
  start_date: z.string(),
  end_date: z.string(),
  credit: z.string(),
  time_limit: z.string(),
  password: z.string(),
  exam_uuid: z.string().nullable(),
  ps_exam_id: z.string().nullable(),
  pt_course_id: z.string().nullable(),
  pt_course_name: z.string().nullable(),
  pt_exam_id: z.string().nullable(),
  pt_exam_name: z.string().nullable(),
  active: z.string(),
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const result = await queryRows(
      sql.assessment_access_rules,
      { assessment_id: res.locals.assessment.id, link_exam_id: config.syncExamIdAccessRules },
      AssessmentAccessRulesSchema,
    );
    res.locals.access_rules = result;
    res.send(InstructorAssessmentAccess({ resLocals: res.locals }));
  }),
);

export default router;
