import { Router, type Response } from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import { loadSqlEquiv, queryRow } from '@prairielearn/postgres';

import { instructorInstanceAdminBillingState } from '../../lib/billing/components/InstructorInstanceAdminBillingForm.html.js';
import { type PlanName } from '../../lib/billing/plans-types.js';
import {
  getPlanGrantsForContext,
  getRequiredPlansForCourseInstance,
  updateRequiredPlansForCourseInstance,
} from '../../lib/billing/plans.js';

import {
  type EnrollmentLimitSource,
  InstructorCourseInstanceBilling,
} from './instructorInstanceAdminBilling.html.js';

const router = Router({ mergeParams: true });
const sql = loadSqlEquiv(import.meta.url);

async function loadPageData(res: Response) {
  const requiredPlans = await getRequiredPlansForCourseInstance(res.locals.course_instance.id);
  const institutionPlanGrants = await getPlanGrantsForContext({
    institution_id: res.locals.institution.id,
  });
  const courseInstancePlanGrants = await getPlanGrantsForContext({
    institution_id: res.locals.institution.id,
    course_instance_id: res.locals.course_instance.id,
  });

  const enrollmentCount = await queryRow(
    sql.course_instance_enrollment_count,
    { course_instance_id: res.locals.course_instance.id },
    z.number(),
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
      throw new error.HttpStatusError(404, 'Not Found');
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
      }),
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
        // Only course owners can manage billing.
        editable: res.locals.authz_data.has_course_permission_own,
        resLocals: res.locals,
      }),
    );
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    // This page is behind a feature flag for now.
    if (!res.locals.billing_enabled) {
      throw new error.HttpStatusError(404, 'Not Found');
    }

    // Only course owners can manage billing.
    if (!res.locals.authz_data.has_course_permission_own) {
      throw new error.HttpStatusError(403, 'Access denied (must be course owner)');
    }

    const pageData = await loadPageData(res);

    const desiredRequiredPlans: PlanName[] = [];
    if (req.body.student_billing_enabled === '1') desiredRequiredPlans.push('basic');
    if (req.body.compute_enabled === '1') desiredRequiredPlans.push('compute');

    const state = instructorInstanceAdminBillingState({
      ...pageData,
      // We already checked authorization above.
      editable: true,
      initialRequiredPlans: pageData.requiredPlans,
      desiredRequiredPlans,
    });

    if (!state.studentBillingCanChange && state.studentBillingDidChange) {
      const verb = desiredRequiredPlans.includes('basic') ? 'enabled' : 'disabled';
      throw new error.HttpStatusError(400, `Student billing cannot be ${verb}.`);
    }

    if (!state.computeCanChange && state.computeDidChange) {
      const verb = desiredRequiredPlans.includes('compute') ? 'enabled' : 'disabled';
      throw new error.HttpStatusError(400, `Compute cannot be ${verb}.`);
    }

    await updateRequiredPlansForCourseInstance(
      res.locals.course_instance.id,
      desiredRequiredPlans,
      res.locals.authn_user.user_id,
    );
    res.redirect(req.originalUrl);
  }),
);

export default router;
