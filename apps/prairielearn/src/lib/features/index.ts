import { FeatureManager } from './manager';

const featureNames = [
  'course-instance-billing',
  'enforce-plan-grants-for-questions',
  // Can only be applied to courses/institutions.
  'process-questions-in-worker',
  'question-sharing',
  'allow-rpy2',
  // Can only be applied to institutions.
  'lti13',
] as const;

const features = new FeatureManager(featureNames);

export type FeatureName = (typeof featureNames)[number];

export { features };
