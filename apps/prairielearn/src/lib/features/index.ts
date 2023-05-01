import { FeatureManager, FeatureGrantType } from './manager';

const features = new FeatureManager(['course:manual-grading']);

module.exports = { features, FeatureGrantType };
