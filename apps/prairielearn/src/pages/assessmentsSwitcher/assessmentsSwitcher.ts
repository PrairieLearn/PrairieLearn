import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';
import { run } from '@prairielearn/run';

import type { NavSubPage } from '../../components/Navbar.types.js';

import {
  AssessmentDropdownItemDataSchema,
  AssessmentSwitcher,
} from './assessmentsSwitcher.html.js';
const sql = loadSqlEquiv(import.meta.url);

const router = Router({
  mergeParams: true, // Ensures that assessmentsSwitcher can retrieve req.locals.course_instance and req.params.assessment_id from the parent router
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const subPage = req.query.subPage as NavSubPage | undefined;

    // Target subpage for the assessment dropdown links
    const targetSubPage = run(() => {
      if (!subPage) return '';
      if (subPage === 'assessment_instance') return 'instances';
      if (subPage === 'file_edit') return 'file_view';
      return subPage;
    });

    const assessmentDropdownItemsData = await queryRows(
      sql.select_assessment_dropdown_items_data,
      {
        course_instance_id: res.locals.course_instance.id,
        authz_data: res.locals.authz_data,
        req_date: res.locals.req_date,
        assessments_group_by: res.locals.course_instance.assessments_group_by,
      },
      AssessmentDropdownItemDataSchema,
    );

    res.send(
      AssessmentSwitcher({
        assessmentDropdownItemsData,
        selectedAssessmentId: req.params.assessment_id,
        assessmentsGroupBy: res.locals.course_instance.assessments_group_by,
        plainUrlPrefix: res.locals.plainUrlPrefix,
        courseInstanceId: res.locals.course_instance.id,
        targetSubPage,
      }),
    );
  }),
);

export default router;
