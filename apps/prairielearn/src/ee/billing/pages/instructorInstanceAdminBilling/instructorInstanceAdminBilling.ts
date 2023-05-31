import { Router } from 'express';
import asyncHandler = require('express-async-handler');
import { z } from 'zod';
import { loadSqlEquiv, queryRow } from '@prairielearn/postgres';
import error = require('@prairielearn/error');

import { InstructorCourseInstanceBilling } from './instructorInstanceAdminBilling.html';
import {
  PlanName,
  getFeaturesForPlans,
  getPlanGrantsForCourseInstance,
  getPlanGrantsForInstitution,
  getRequiredPlansForCourseInstance,
  updateRequiredPlansForCourseInstance,
} from '../../plans';

const router = Router({ mergeParams: true });
const sql = loadSqlEquiv(__filename);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    // This page is behind a feature flag for now.
    if (!res.locals.billing_enabled) {
      throw error.make(404, 'Not Found');
    }

    // TODO: limit access to course owners.
    console.log('course_instance', res.locals.course_instance);

    const institutionPlanGrants = await getPlanGrantsForInstitution(res.locals.institution.id);
    const courseInstancePlanGrants = await getPlanGrantsForCourseInstance(
      res.locals.course_instance.id
    );
    const planGrantFeatures = getFeaturesForPlans(
      institutionPlanGrants.concat(courseInstancePlanGrants)
    );
    console.log(planGrantFeatures);
    const requiredPlans = await getRequiredPlansForCourseInstance(res.locals.course_instance.id);
    const studentBillingEnabled = requiredPlans.includes('basic');

    const enrollmentCount = await queryRow(
      sql.course_instance_enrollment_count,
      { course_instance_id: res.locals.course_instance.id },
      z.number()
    );
    const enrollmentLimit =
      res.locals.course_instance.enrollment_limit ??
      res.locals.institution.course_instance_enrollment_limit;
    const enrollmentLimitSource = res.locals.course_instance.enrollment_limit
      ? 'course_instance'
      : 'institution';

    const { external_grading_question_count, workspace_question_count } = await queryRow(
      sql.question_counts,
      { course_id: res.locals.course.id },
      z.object({
        external_grading_question_count: z.number(),
        workspace_question_count: z.number(),
      })
    );

    // TODO: handle case where student billing for enrollments is not enabled
    // and the course instance already has access to certain plans via the institution
    // or the course instance itself.
    res.send(
      InstructorCourseInstanceBilling({
        studentBillingEnabled,
        computeEnabled: requiredPlans.includes('compute'),
        enrollmentCount,
        enrollmentLimit,
        enrollmentLimitSource,
        externalGradingQuestionCount: external_grading_question_count,
        workspaceQuestionCount: workspace_question_count,
        resLocals: res.locals,
      })
    );
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const plans: PlanName[] = [];

    if (req.body.student_billing_enabled === '1') {
      plans.push('basic');
    }

    if (req.body.compute_enabled === '1') {
      plans.push('compute');
    }

    // TODO: forbid removal of `basic` plan if enrollments exceed any limits.
    await updateRequiredPlansForCourseInstance(res.locals.course_instance.id, plans);
    res.redirect(req.originalUrl);
  })
);

export default router;
