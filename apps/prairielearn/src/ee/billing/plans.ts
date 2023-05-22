export const PLAN_FEATURES = ['course_instance_access', 'external_grading', 'workspaces'] as const;

export type PlanFeatureName = (typeof PLAN_FEATURES)[number];

interface Plan {
  features: PlanFeatureName[];
  initialEnrollmentLimit?: number;
}

export const PLANS = {
  // Access to all features for a limited number of students.
  free: {
    features: ['course_instance_access', 'workspaces', 'external_grading'],
    initialEnrollmentLimit: 25,
  },
  // Enabled when student-pays is enabled for a course instance.
  basic: {
    features: ['course_instance_access'],
  },
  // Add-on to basic plan that enables workspaces and external grading.
  compute: {
    features: ['workspaces', 'external_grading'],
  },
} satisfies Record<string, Plan>;

export type PlanName = keyof typeof PLANS;
