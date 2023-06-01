import { z } from 'zod';
import { loadSqlEquiv, queryAsync, queryRows } from '@prairielearn/postgres';
import { PlanGrant, PlanGrantSchema } from '../../lib/db-types';

const sql = loadSqlEquiv(__filename);

export const PLAN_FEATURE_NAMES = [
  'course-instance-access',
  'external-grading',
  'workspaces',
] as const;
export const PLAN_NAMES = ['basic', 'compute', 'everything'] as const;

export type PlanFeatureName = (typeof PLAN_FEATURE_NAMES)[number];
export type PlanName = (typeof PLAN_NAMES)[number];

interface Plan {
  features: PlanFeatureName[];
  initialEnrollmentLimit?: number;
}

export const PLANS = {
  // Enabled when student-pays is enabled for a course instance.
  basic: {
    features: ['course-instance-access'],
  },
  // Add-on to basic plan that enables workspaces and external grading.
  compute: {
    features: ['workspaces', 'external-grading'],
  },
  // All features that exist.
  everything: {
    features: ['workspaces', 'external-grading'],
  },
} satisfies Record<PlanName, Plan>;

export interface PlanGrantUpdate {
  plan: PlanName;
  grantType: 'trial' | 'stripe' | 'invoice' | 'gift';
}

export async function getPlanGrantsForInstitution(institution_id: string): Promise<PlanGrant[]> {
  return queryRows(sql.select_plan_grants_for_institution, { institution_id }, PlanGrantSchema);
}

export async function getPlanGrantsForCourseInstance(
  course_instance_id: string
): Promise<PlanGrant[]> {
  return queryRows(
    sql.select_plan_grants_for_course_instance,
    { course_instance_id },
    PlanGrantSchema
  );
}

export async function getRequiredPlansForCourseInstance(
  course_instance_id: string
): Promise<PlanName[]> {
  return queryRows(
    sql.select_required_plans_for_course_instance,
    { course_instance_id },
    z.enum(PLAN_NAMES)
  );
}

export async function updateRequiredPlansForCourseInstance(
  course_instance_id: string,
  plans: PlanName[]
) {
  await queryAsync(sql.update_required_plans_for_course_instance, { course_instance_id, plans });
}

export function getFeaturesForPlans(plans: PlanName[]): PlanFeatureName[] {
  const features = new Set<PlanFeatureName>();
  for (const plan of plans) {
    PLANS[plan].features.forEach((feature) => features.add(feature));
  }
  return Array.from(features);
}

export async function updatePlanGrantsForInstitution(
  institution_id: string,
  plans: PlanGrantUpdate[]
) {
  await queryAsync(sql.update_plan_grants_for_institution, {
    institution_id,
    plans: JSON.stringify(plans),
  });
}
