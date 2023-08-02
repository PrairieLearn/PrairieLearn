import { FeatureManager } from './manager';
import { featuresMiddleware } from './middleware';

const featureNames = [
  'manual-grading-rubrics',
  'course-instance-billing',
  // Can only be applied to courses/institutions.
  'process-questions-in-worker',
] as const;

const features = new FeatureManager(featureNames);

export type FeatureName = (typeof featureNames)[number];

export { features, featuresMiddleware };
