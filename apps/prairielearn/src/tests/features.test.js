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
    const features = new FeatureManager(['test:example-feature-flag']);

    await features.enable('test:example-feature-flag', FeatureGrantType.Manual);
    assert.isTrue(await features.enabled('test:example-feature-flag'));
    assert.isTrue(await features.enabled('test:example-feature-flag', { institution_id: 1 }));
    assert.isTrue(await features.enabled('test:example-feature-flag', { user_id: 1 }));

    await features.disable('test:example-feature-flag');
    assert.isFalse(await features.enabled('test:example-feature-flag'));
  });

  it('enables and disables a feature flag for an institution', async () => {
    const features = new FeatureManager(['test:example-feature-flag']);
    const context = { institution_id: 1 };

    await features.enable('test:example-feature-flag', FeatureGrantType.Manual, context);
    assert.isTrue(await features.enabled('test:example-feature-flag', context));
    assert.isFalse(await features.enabled('test:example-feature-flag'));

    await features.disable('test:example-feature-flag', context);
    assert.isFalse(await features.enabled('test:example-feature-flag', context));
  });

  it('enables and disables a feature flag for a course', async () => {
    const features = new FeatureManager(['test:example-feature-flag']);
    const context = { institution_id: 1, course_id: 1 };

    await features.enable('test:example-feature-flag', FeatureGrantType.Manual, context);
    assert.isTrue(await features.enabled('test:example-feature-flag', context));
    assert.isFalse(await features.enabled('test:example-feature-flag'));

    await features.disable('test:example-feature-flag', context);
    assert.isFalse(await features.enabled('test:example-feature-flag', context));
  });

  it('enables and disables a feature flag for a course instance', async () => {
    const features = new FeatureManager(['test:example-feature-flag']);
    const context = { institution_id: 1, course_id: 1, course_instance_id: 1 };

    await features.enable('test:example-feature-flag', FeatureGrantType.Manual, context);
    assert.isTrue(await features.enabled('test:example-feature-flag', context));
    assert.isFalse(await features.enabled('test:example-feature-flag'));

    await features.disable('test:example-feature-flag', context);
    assert.isFalse(await features.enabled('test:example-feature-flag', context));
  });

  it('enables and disables a feature flag for a user', async () => {
    const features = new FeatureManager(['test:example-feature-flag']);
    const context = { user_id: 1 };

    await features.enable('test:example-feature-flag', FeatureGrantType.Manual, context);
    assert.isTrue(await features.enabled('test:example-feature-flag', context));

    await features.disable('test:example-feature-flag', context);
    assert.isFalse(await features.enabled('test:example-feature-flag', context));
  });

  it('enables and disables a flag for a user in a course instance', async () => {
    const features = new FeatureManager(['test:example-feature-flag']);
    const context = { institution_id: 1, course_id: 1, course_instance_id: 1, user_id: 1 };

    await features.enable('test:example-feature-flag', FeatureGrantType.Manual, context);
    assert.isTrue(await features.enabled('test:example-feature-flag', context));
    assert.isFalse(await features.enabled('test:example-feature-flag', { user_id: 1 }));

    await features.disable('test:example-feature-flag', context);
    assert.isFalse(await features.enabled('test:example-feature-flag', context));
    assert.isFalse(await features.enabled('test:example-feature-flag', { user_id: 1 }));
  });
});
