import { FeatureManager } from './manager.js';

const featureNames = [
  'course-instance-billing',
  'enforce-plan-grants-for-questions',

  // Should only be applied to courses/institutions.
  'question-sharing', // This also controls course instance sharing.
  'consume-public-questions',
  'ai-grading',
  // Gates the Stop button for in-progress AI grading jobs. Off by default
  // so the new 'Stopping'/'Stopped' enum values are never written until all
  // pods have shipped the updated EnumJobStatusSchema; flip it on once the
  // rollout completes.
  'ai-grading-stop',
  'ai-submission-grouping',
  'disable-public-workspaces',
  'enhanced-access-control',

  // Should be applied to courses only.
  'ai-question-generation-course-toggle',

  // Can be applied to any context.
  'ai-question-generation',
  'rich-text-editor',

  // LTI 1.1. Deprecated so keep scope to course instance, where possible.
  'lti11',
] as const;

const features = new FeatureManager(featureNames);

export type FeatureName = (typeof featureNames)[number];

export { features };
