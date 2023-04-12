// @ts-check
const { FeatureManager } = require('./manager');

const features = new FeatureManager(['course:manual-grading']);

module.exports = { features };
