// @ts-check
const { FeatureManager, FeatureGrantType } = require('./manager');

const features = new FeatureManager(['course:manual-grading']);

module.exports = { features, FeatureGrantType };
