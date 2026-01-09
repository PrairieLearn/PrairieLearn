import { Router } from 'express';

import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import { typedAsyncHandler } from '../../lib/res-locals.js';

import {
  AssessmentAccessRulesSchema,
  InstructorAssessmentAccess,
} from './instructorAssessmentAccess.html.js';

const router = Router();
const sql = loadSqlEquiv(import.meta.url);

router.get(
  '/',
  typedAsyncHandler<'assessment'>(async (req, res) => {
    const accessRules = await queryRows(
      sql.assessment_access_rules,
      { assessment_id: res.locals.assessment.id },
      AssessmentAccessRulesSchema,
    );
    res.send(InstructorAssessmentAccess({ resLocals: res.locals, accessRules }));
  }),
);

export default router;
