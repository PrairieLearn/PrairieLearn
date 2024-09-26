import { FeatureManager } from './manager.js';

const featureNames = {
  'course-instance-billing': false,
  'enforce-plan-grants-for-questions': false,
  // Should only be applied to courses/institutions.
  'process-questions-in-worker': false,
  'question-sharing': false,
  'ai-grading': false,
  'disable-public-workspaces': false,
  'ai-question-generation': false,
  'bootstrap-4': false,
  // Should only be applied to institutions.
  lti13: false,
} as const;

const features = new FeatureManager(featureNames);

export type FeatureName = keyof typeof featureNames;

export { features };
