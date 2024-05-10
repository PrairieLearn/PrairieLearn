import * as express from 'express';
import asyncHandler from 'express-async-handler';
import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import { config } from '../../lib/config.js';
import {
  InstructorAssessmentAccess,
  AssessmentAccessRulesSchema,
} from './instructorAssessmentAccess.html.js';

const router = express.Router();
const sql = loadSqlEquiv(import.meta.url);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const accessRules = await queryRows(
      sql.assessment_access_rules,
      { assessment_id: res.locals.assessment.id, link_exam_id: config.syncExamIdAccessRules },
      AssessmentAccessRulesSchema,
    );
    res.send(InstructorAssessmentAccess({ resLocals: res.locals, accessRules }));
  }),
);

export default router;
