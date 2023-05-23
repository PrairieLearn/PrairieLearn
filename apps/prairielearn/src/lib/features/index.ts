import { FeatureManager, FeatureGrantType } from './manager';

const features = new FeatureManager(['manual-grading-rubrics', 'course-instance-billing']);

export { features, FeatureGrantType };
