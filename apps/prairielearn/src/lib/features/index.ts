import { FeatureManager } from './manager';

const featureNames = [
  'manual-grading-rubrics',
  'course-instance-billing',
  'enforce-plan-grants-for-questions',
  'lti13',
  // Can only be applied to courses/institutions.
  'process-questions-in-worker',
  'question-sharing',
] as const;

const features = new FeatureManager(featureNames);

export type FeatureName = (typeof featureNames)[number];

export { features };
