import * as express from 'express';
import asyncHandler from 'express-async-handler';

import * as error from '@prairielearn/error';
import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import { InstructorAssessmentAccess } from './instructorAssessmentAccess.html.js';
import { AssessmentAccessRulesSchema } from './instructorAssessmentAccess.types.js';

const router = express.Router();
const sql = loadSqlEquiv(import.meta.url);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const accessRules = await queryRows(
      sql.assessment_access_rules,
      { assessment_id: res.locals.assessment.id },
      AssessmentAccessRulesSchema,
    );

    res.send(InstructorAssessmentAccess({ resLocals: res.locals, accessRules }));
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_instance_permission_edit) {
      throw new error.HttpStatusError(403, 'Access denied (must be an instructor)');
    }

    if (req.body.__action === 'edit_access_rules') {
      console.log('edit_access_rules', req.body);
    }

    res.redirect(req.originalUrl);
  }),
);

export default router;
