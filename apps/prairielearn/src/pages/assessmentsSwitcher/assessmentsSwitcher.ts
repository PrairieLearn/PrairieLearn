import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import type { NavSubPage } from '../../components/Navbar.types.js';

import { AssessmentDropdownRowSchema, AssessmentSwitcher } from './assessmentsSwitcher.html.js';
const sql = loadSqlEquiv(import.meta.url);

const router = Router({
  mergeParams: true, // Ensures that assessmentsSwitcher can retrieve req.locals.course_instance and req.params.assessment_id from the parent router
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const assessmentDropdownRows = await queryRows(
      sql.select_assessments,
      {
        course_instance_id: res.locals.course_instance.id,
        authz_data: res.locals.authz_data,
        req_date: res.locals.req_date,
        assessments_group_by: res.locals.course_instance.assessments_group_by,
      },
      AssessmentDropdownRowSchema,
    );

    res.send(
      AssessmentSwitcher({
        assessmentDropdownRows,
        selectedAssessmentId: req.params.assessment_id,
        assessmentsGroupBy: res.locals.course_instance.assessments_group_by,
        urlPrefix: res.locals.urlPrefix,
        targetSubPage: req.query.targetSubPage as NavSubPage,
      }),
    );
  }),
);

export default router;
