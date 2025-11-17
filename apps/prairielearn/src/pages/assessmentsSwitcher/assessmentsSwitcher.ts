import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { run } from '@prairielearn/run';

import type { NavSubPage } from '../../components/Navbar.types.js';
import { selectAssessments } from '../../models/assessment.js';

import { AssessmentSwitcher } from './assessmentsSwitcher.html.js';

const router = Router({ mergeParams: true });

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

    const assessmentRows = await selectAssessments({
      course_instance_id: res.locals.course_instance.id,
    });

    res.send(
      AssessmentSwitcher({
        assessmentRows,
        assessmentsGroupBy: res.locals.course_instance.assessments_group_by,
        currentAssessmentId: req.params.assessment_id,
        courseInstanceId: res.locals.course_instance.id,

        targetSubPage,
      }),
    );
  }),
);

export default router;
