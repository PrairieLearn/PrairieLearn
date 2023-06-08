import { FeatureManager } from './manager';
import { featuresMiddleware } from './middleware';

const features = new FeatureManager(['manual-grading-rubrics']);

export { features, featuresMiddleware };
