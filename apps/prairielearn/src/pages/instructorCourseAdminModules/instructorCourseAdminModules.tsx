import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import * as sqldb from '@prairielearn/postgres';

import { PageLayout } from '../../components/PageLayout.js';
import { extractPageContext } from '../../lib/client/page-context.js';
import { StaffAssessmentModuleSchema } from '../../lib/client/safe-db-types.js';

import { AssessmentModulesTable } from './components/AssessmentModulesTable.js';

const router = Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const pageContext = extractPageContext(res.locals, {
      pageType: 'course',
      accessType: 'instructor',
    });

    const assessmentModules = await sqldb.queryRows(
      sql.select_assessment_modules,
      { course_id: pageContext.course.id },
      StaffAssessmentModuleSchema,
    );

    res.send(
      PageLayout({
        resLocals: res.locals,
        pageTitle: 'Assessment Modules',
        navContext: {
          type: 'instructor',
          page: 'course_admin',
          subPage: 'modules',
        },
        content: <AssessmentModulesTable assessmentModules={assessmentModules} />,
      }),
    );
  }),
);

export default router;
