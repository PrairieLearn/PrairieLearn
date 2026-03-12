import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { run } from '@prairielearn/run';

import type { NavSubPage } from '../../components/Navbar.types.js';
import { loadAssessmentsForQuestion } from '../../lib/assessment-question-context.js';
import { extractPageContext } from '../../lib/client/page-context.js';
import { selectAssessments } from '../../models/assessment.js';
import { selectCourseInstancesWithStaffAccess } from '../../models/course-instances.js';

import {
  AssessmentSwitcher,
  QuestionAssessmentSwitcherWithTabs,
} from './assessmentsSwitcher.html.js';

const router = Router({ mergeParams: true });

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const subPage = req.query.subPage as NavSubPage;

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

export const questionAssessmentSwitcherByCourseRouter = Router({ mergeParams: true });

questionAssessmentSwitcherByCourseRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { authz_data: authzData, course } = extractPageContext(res.locals, {
      pageType: 'course',
      accessType: 'instructor',
    });

    const courseInstances = await selectCourseInstancesWithStaffAccess({
      course,
      authzData,
      requiredRole: ['Previewer'],
    });

    const questionId = req.params.question_id;
    const currentCourseInstanceId = (req.query.course_instance_id as string) || undefined;
    const currentAssessmentQuestionId = (req.query.assessment_question_id as string) || undefined;

    const courseInstanceAssessments = await Promise.all(
      courseInstances.map(async (ci) => ({
        courseInstance: ci,
        assessments: await loadAssessmentsForQuestion(questionId, ci.id),
      })),
    );

    const filtered = courseInstanceAssessments.filter((entry) => entry.assessments.length > 0);

    res.send(
      QuestionAssessmentSwitcherWithTabs({
        courseInstanceAssessments: filtered,
        courseId: course.id,
        questionId,
        currentCourseInstanceId,
        currentAssessmentQuestionId,
      }),
    );
  }),
);
