import { FeatureManager, FeatureGrantType } from './manager';

const features = new FeatureManager([
  // Can only be applied to courses/institutions.
  'process-questions-in-worker',
]);

export { features, FeatureGrantType };
