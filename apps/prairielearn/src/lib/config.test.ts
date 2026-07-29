import { assert, describe, it } from 'vitest';

import { ConfigSchema } from './config.js';

describe('key ring configuration', () => {
  for (const configKey of [
    'secretKey',
    'databaseEncryptionKey',
    'prairieTestSharedAuthSecret',
    'stripeWebhookSigningSecret',
  ] as const) {
    it(`accepts scalar and nonempty array values for ${configKey}`, () => {
      const value = configKey === 'databaseEncryptionKey' ? '1'.repeat(64) : 'key';

      assert.isTrue(ConfigSchema.shape[configKey].safeParse(value).success);
      assert.isTrue(ConfigSchema.shape[configKey].safeParse([value, value]).success);
      assert.isFalse(ConfigSchema.shape[configKey].safeParse([]).success);
      assert.isFalse(ConfigSchema.shape[configKey].safeParse([value, 1]).success);
    });
  }

  it('rejects invalid database encryption keys in a key ring', () => {
    assert.isFalse(
      ConfigSchema.shape.databaseEncryptionKey.safeParse(['1'.repeat(64), 'invalid']).success,
    );
  });

  it('continues to allow a null Stripe webhook signing secret', () => {
    assert.isTrue(ConfigSchema.shape.stripeWebhookSigningSecret.safeParse(null).success);
  });
});
