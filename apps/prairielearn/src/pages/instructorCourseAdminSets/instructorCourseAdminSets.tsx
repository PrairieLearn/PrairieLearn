import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import * as sqldb from '@prairielearn/postgres';

import { PageLayout } from '../../components/PageLayout.js';
import { extractPageContext } from '../../lib/client/page-context.js';
import { StaffAssessmentSetSchema } from '../../lib/client/safe-db-types.js';

import { AssessmentSetsTable } from './components/AssessmentSetsTable.js';

const router = Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const pageContext = extractPageContext(res.locals, {
      pageType: 'course',
      accessType: 'instructor',
    });

    const assessmentSets = await sqldb.queryRows(
      sql.select_assessment_sets,
      { course_id: pageContext.course.id },
      StaffAssessmentSetSchema,
    );

    res.send(
      PageLayout({
        resLocals: res.locals,
        pageTitle: 'Assessment Sets',
        navContext: {
          type: 'instructor',
          page: 'course_admin',
          subPage: 'sets',
        },
        options: {
          fullWidth: true,
        },
        content: <AssessmentSetsTable assessmentSets={assessmentSets} />,
      }),
    );
  }),
);

export default router;
