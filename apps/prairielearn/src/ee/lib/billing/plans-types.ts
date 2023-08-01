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
  // Enabled when student billing for enrollments is enabled for a course instance.
  basic: {
    features: ['course-instance-access'],
  },
  // Enables workspaces and external grading. Can be used in combination with
  // the `basic` plan (for a course using student billing for enrollments) or
  // in isolation (a course instance's institution is paying for the basic plan
  // but the course instance wants to use workspaces and external grading).
  compute: {
    features: ['workspaces', 'external-grading'],
  },
  // All features that exist.
  everything: {
    features: ['workspaces', 'external-grading'],
  },
} satisfies Record<PlanName, Plan>;

export function getFeaturesForPlans(plans: PlanName[]): PlanFeatureName[] {
  const features = new Set<PlanFeatureName>();
  for (const plan of plans) {
    PLANS[plan].features.forEach((feature) => features.add(feature));
  }
  return Array.from(features);
}

export function planGrantsMatchPlanFeatures(grantedPlans: PlanName[], plans: PlanName[]): boolean {
  const planGrantsFeatures = getFeaturesForPlans(grantedPlans);
  const planFeatures = getFeaturesForPlans(plans);
  return (
    planGrantsFeatures.length === planFeatures.length &&
    planGrantsFeatures.every((feature) => planFeatures.includes(feature))
  );
}
