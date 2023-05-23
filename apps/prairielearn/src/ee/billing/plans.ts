import { z } from 'zod';
import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

const sql = loadSqlEquiv(__filename);

export const PLAN_FEATURE_NAMES = [
  'course-instance-access',
  'external-grading',
  'workspaces',
] as const;
export const PLAN_NAMES = ['free', 'basic', 'compute'] as const;

export type PlanFeatureName = (typeof PLAN_FEATURE_NAMES)[number];
export type PlanName = (typeof PLAN_NAMES)[number];

interface Plan {
  features: PlanFeatureName[];
  initialEnrollmentLimit?: number;
}

export const PLANS = {
  // Access to all features for a limited number of students.
  free: {
    features: ['course-instance-access', 'workspaces', 'external-grading'],
    initialEnrollmentLimit: 25,
  },
  // Enabled when student-pays is enabled for a course instance.
  basic: {
    features: ['course-instance-access'],
  },
  // Add-on to basic plan that enables workspaces and external grading.
  compute: {
    features: ['workspaces', 'external-grading'],
  },
} satisfies Record<PlanName, Plan>;

export async function getPlanGrantsForInstitution(institution_id: string): Promise<PlanName[]> {
  return queryRows(sql.select_plan_grants_for_institution, { institution_id }, z.enum(PLAN_NAMES));
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

export function getFeaturesForPlans(plans: PlanName[]): PlanFeatureName[] {
  const features = new Set<PlanFeatureName>();
  for (const plan of plans) {
    PLANS[plan].features.forEach((feature) => features.add(feature));
  }
  return Array.from(features);
}
