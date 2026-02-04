import { FeatureManager } from './manager.js';

const featureNames = [
  'course-instance-billing',
  'enforce-plan-grants-for-questions',
  // Should only be applied to courses/institutions.
  'question-sharing', // This also controls course instance sharing.
  'consume-public-questions',
  'ai-grading',
  'ai-grading-model-selection',
  'disable-public-workspaces',
  // Should be applied to courses only.
  'ai-question-generation-course-toggle',
  // Can be applied to any context.
  'ai-question-generation',
  // LTI 1.1. Deprecated so keep scope to course instance, where possible.
  'lti11',
  // Can be applied to any context.
  'assessment-questions-editor',
  'rich-text-editor',
] as const;

const features = new FeatureManager(featureNames);

export type FeatureName = (typeof featureNames)[number];

export { features };
