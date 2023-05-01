import { FeatureManager, FeatureGrantType } from './manager';

const features = new FeatureManager(['course:manual-grading']);

export { features, FeatureGrantType };
