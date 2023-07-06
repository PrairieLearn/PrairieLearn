import { FeatureManager } from './manager';
import { featuresMiddleware } from './middleware';

const features = new FeatureManager([
  'manual-grading-rubrics',
  // Can only be applied to courses/institutions.
  'process-questions-in-worker',
]);

export { features, featuresMiddleware };
