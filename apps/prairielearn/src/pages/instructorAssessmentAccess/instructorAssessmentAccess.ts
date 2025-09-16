import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import { features } from '../../lib/features/index.js';

import {
  AssessmentAccessRulesSchema,
  InstructorAssessmentAccess,
} from './instructorAssessmentAccess.html.js';

const router = Router();
const sql = loadSqlEquiv(import.meta.url);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const accessRules = await queryRows(
      sql.assessment_access_rules,
      { assessment_id: res.locals.assessment.id },
      AssessmentAccessRulesSchema,
    );
    const enhancedAccessControl = await features.enabled('enhanced-access-control');
    res.send(
      InstructorAssessmentAccess({ resLocals: res.locals, accessRules, enhancedAccessControl }),
    );
  }),
);

export default router;
