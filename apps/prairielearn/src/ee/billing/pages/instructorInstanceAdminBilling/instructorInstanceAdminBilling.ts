import { Router, type Response } from 'express';
import asyncHandler = require('express-async-handler');
import { z } from 'zod';
import { loadSqlEquiv, queryRow } from '@prairielearn/postgres';
import error = require('@prairielearn/error');

import {
  EnrollmentLimitSource,
  InstructorCourseInstanceBilling,
} from './instructorInstanceAdminBilling.html';
import { PlanName } from '../../plans-types';
import {
  getPlanGrantsForCourseInstance,
  getPlanGrantsForInstitution,
  getRequiredPlansForCourseInstance,
  updateRequiredPlansForCourseInstance,
} from '../../plans';
import { instructorInstanceAdminBillingState } from '../../components/InstructorInstanceAdminBillingForm.html';

const router = Router({ mergeParams: true });
const sql = loadSqlEquiv(__filename);

async function loadPageData(res: Response) {
  const requiredPlans = await getRequiredPlansForCourseInstance(res.locals.course_instance.id);
  const institutionPlanGrants = await getPlanGrantsForInstitution(res.locals.institution.id);
  const courseInstancePlanGrants = await getPlanGrantsForCourseInstance(
    res.locals.course_instance.id
  );

  const enrollmentCount = await queryRow(
    sql.course_instance_enrollment_count,
    { course_instance_id: res.locals.course_instance.id },
    z.number()
  );
  const enrollmentLimit =
    res.locals.course_instance.enrollment_limit ??
    res.locals.institution.course_instance_enrollment_limit;
  const enrollmentLimitSource: EnrollmentLimitSource = res.locals.course_instance.enrollment_limit
    ? 'course_instance'
    : 'institution';

  return {
    requiredPlans,
    institutionPlanGrants: institutionPlanGrants.map((planGrant) => planGrant.plan_name),
    courseInstancePlanGrants: courseInstancePlanGrants.map((planGrant) => planGrant.plan_name),
    enrollmentCount,
    enrollmentLimit,
    enrollmentLimitSource,
  };
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    // This page is behind a feature flag for now.
    if (!res.locals.billing_enabled) {
      throw error.make(404, 'Not Found');
    }

    // Only course owners can manage billing.
    if (!res.locals.authz_data.has_course_permission_own) {
      throw error.make(403, 'Access denied (must be course owner)');
    }

    const {
      requiredPlans,
      institutionPlanGrants,
      courseInstancePlanGrants,
      enrollmentCount,
      enrollmentLimit,
      enrollmentLimitSource,
    } = await loadPageData(res);

    const { external_grading_question_count, workspace_question_count } = await queryRow(
      sql.question_counts,
      { course_id: res.locals.course.id },
      z.object({
        external_grading_question_count: z.number(),
        workspace_question_count: z.number(),
      })
    );

    res.send(
      InstructorCourseInstanceBilling({
        requiredPlans,
        institutionPlanGrants,
        courseInstancePlanGrants,
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
    // This page is behind a feature flag for now.
    if (!res.locals.billing_enabled) {
      throw error.make(404, 'Not Found');
    }

    // Only course owners can manage billing.
    if (!res.locals.authz_data.has_course_permission_own) {
      throw error.make(403, 'Access denied (must be course owner)');
    }

    const pageData = await loadPageData(res);

    const requiredPlans: PlanName[] = [];
    if (req.body.student_billing_enabled === '1') requiredPlans.push('basic');
    if (req.body.compute_enabled === '1') requiredPlans.push('compute');

    const state = instructorInstanceAdminBillingState({
      ...pageData,
      initialRequiredPlans: pageData.requiredPlans,
      requiredPlans,
    });

    // TODO: write tests for the following logic.

    if (!state.studentBillingCanChange && state.studentBillingDidChange) {
      const verb = requiredPlans.includes('basic') ? 'enabled' : 'disabled';
      throw error.make(400, `Student billing cannot be ${verb}.`);
    }

    if (!state.computeCanChange && state.computeDidChange) {
      const verb = requiredPlans.includes('compute') ? 'enabled' : 'disabled';
      throw error.make(400, `Compute cannot be ${verb}.`);
    }

    await updateRequiredPlansForCourseInstance(res.locals.course_instance.id, requiredPlans);
    res.redirect(req.originalUrl);
  })
);

export default router;
