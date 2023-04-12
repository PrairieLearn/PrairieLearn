// @ts-check
const { assert } = require('chai');
const { queryAsync } = require('@prairielearn/postgres');

const helperCourse = require('./helperCourse');
const helperDb = require('./helperDb');
const { FeatureManager, FeatureGrantType } = require('../lib/features/manager');

describe('features', () => {
  before(async () => {
    await helperDb.before();
    await helperCourse.syncCourse();
    await queryAsync('INSERT INTO users (name, uid) VALUES ($name, $uid);', {
      name: 'Test User',
      uid: 'test@example.com',
    });
  });

  beforeEach(async () => {
    await queryAsync('DELETE FROM feature_grants', {});
  });

  after(async () => {
    await helperDb.after();
  });

  it('enables and disables a global feature flag', async () => {
    const features = new FeatureManager(['course:manual-grading']);

    await features.enable('course:manual-grading', FeatureGrantType.Manual);
    assert.isTrue(await features.enabled('course:manual-grading'));
    assert.isTrue(await features.enabled('course:manual-grading', { institution_id: 1 }));
    assert.isTrue(await features.enabled('course:manual-grading', { user_id: 1 }));

    await features.disable('course:manual-grading', context);
    assert.isFalse(await features.enabled('course:manual-grading'));
  });

  it('enables and disables a feature flag for an institution', async () => {
    const features = new FeatureManager(['course:manual-grading']);
    const context = { institution_id: 1 };

    await features.enable('course:manual-grading', FeatureGrantType.Manual, context);
    assert.isTrue(await features.enabled('course:manual-grading', context));
    assert.isFalse(await features.enabled('course:manual-grading'));

    await features.disable('course:manual-grading', context);
    assert.isFalse(await features.enabled('course:manual-grading', context));
  });

  it('enables and disables a feature flag for a course', async () => {
    const features = new FeatureManager(['course:manual-grading']);
    const context = { institution_id: 1, course_id: 1 };

    await features.enable('course:manual-grading', FeatureGrantType.Manual, context);
    assert.isTrue(await features.enabled('course:manual-grading', context));
    assert.isFalse(await features.enabled('course:manual-grading'));

    await features.disable('course:manual-grading', context);
    assert.isFalse(await features.enabled('course:manual-grading', context));
  });

  it('enables and disables a feature flag for a course instance', async () => {
    const features = new FeatureManager(['course:manual-grading']);
    const context = { institution_id: 1, course_id: 1, course_instance_id: 1 };

    await features.enable('course:manual-grading', FeatureGrantType.Manual, context);
    assert.isTrue(await features.enabled('course:manual-grading', context));
    assert.isFalse(await features.enabled('course:manual-grading'));

    await features.disable('course:manual-grading', context);
    assert.isFalse(await features.enabled('course:manual-grading', context));
  });

  it('enables and disables a feature flag for a user', async () => {
    const features = new FeatureManager(['course:manual-grading']);
    const context = { user_id: 1 };

    await features.enable('course:manual-grading', FeatureGrantType.Manual, context);
    assert.isTrue(await features.enabled('course:manual-grading', context));

    await features.disable('course:manual-grading', context);
    assert.isFalse(await features.enabled('course:manual-grading', context));
  });

  it('enables and disables a flag for a user in a course instance', async () => {
    const features = new FeatureManager(['course:manual-grading']);
    const context = { institution_id: 1, course_id: 1, course_instance_id: 1, user_id: 1 };

    await features.enable('course:manual-grading', FeatureGrantType.Manual, context);
    assert.isTrue(await features.enabled('course:manual-grading', context));
    assert.isFalse(await features.enabled('course:manual-grading', { user_id: 1 }));

    await features.disable('course:manual-grading', context);
    assert.isFalse(await features.enabled('course:manual-grading', context));
    assert.isFalse(await features.enabled('course:manual-grading', { user_id: 1 }));
  });
});
