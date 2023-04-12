// @ts-check
const { assert } = require('chai');

const helperCourse = require('./helperCourse');
const helperDb = require('./helperDb');
const { FeatureManager } = require('../lib/features/manager');

describe('features', () => {
  before(async () => {
    await helperDb.before();
    await helperCourse.syncCourse();
  });

  after(async () => {
    await helperDb.after();
  });

  it('enables and disables a feature flag for an institution', async () => {
    const features = new FeatureManager(['course:manual-grading']);
    const context = { institution_id: 1 };

    await features.enable('course:manual-grading', context);
    assert.isTrue(await features.enabled('course:manual-grading', context));

    await features.disable('course:manual-grading', context);
    assert.isFalse(await features.enabled('course:manual-grading', context));
  });

  it('enables and disables a feature flag for a course', async () => {
    const features = new FeatureManager(['course:manual-grading']);
    const context = { institution_id: 1, course_id: 1 };

    await features.enable('course:manual-grading', context);
    assert.isTrue(await features.enabled('course:manual-grading', context));

    await features.disable('course:manual-grading', context);
    assert.isFalse(await features.enabled('course:manual-grading', context));
  });
});
