import { FeatureManager } from './manager.js';

const featureNames = [
  'course-instance-billing',
  'enforce-plan-grants-for-questions',
  // Should only be applied to courses/institutions.
  'process-questions-in-worker',
  'question-sharing',
  'ai-grading',
  'disable-public-workspaces',
  'ai-question-generation',
  'bootstrap-4',
  // Should only be applied to institutions.
  'lti13',
] as const;

const features = new FeatureManager(featureNames);

export type FeatureName = (typeof featureNames)[number];

export { features };
