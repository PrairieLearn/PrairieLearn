import { FeatureManager } from './manager.js';

const featureNames = [
  'course-instance-billing',
  'enforce-plan-grants-for-questions',
  // Can only be applied to courses/institutions.
  'process-questions-in-worker',
  'question-sharing',
  'bot-grading',
  'disable-public-workspaces',
  // Can only be applied to institutions.
  'lti13',
  'terms-clickthrough',
] as const;

const features = new FeatureManager(featureNames);

export type FeatureName = (typeof featureNames)[number];

export { features };
