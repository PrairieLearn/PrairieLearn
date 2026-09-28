import { Ajv } from 'ajv';
import { assert, describe, it } from 'vitest';
import { z } from 'zod';

import { ConfigSchema } from './config.js';

describe('support URL configuration', () => {
  const schema = ConfigSchema.pick({ supportSlackUrl: true, supportOfficeHoursUrl: true });
  const validateJson = new Ajv({ formats: { uri: true } }).compile(
    z.toJSONSchema(schema, { target: 'draft-07', io: 'input' }),
  );

  it('allows both support URLs to be omitted', () => {
    assert.deepEqual(schema.parse({}), { supportSlackUrl: null, supportOfficeHoursUrl: null });
    assert.isTrue(validateJson({}));
  });

  describe.each(['supportSlackUrl', 'supportOfficeHoursUrl'] as const)('%s', (key) => {
    it.each([
      { value: 'https://example.com/support', valid: true },
      { value: null, valid: true },
      { value: 'http://example.com/support', valid: false },
      { value: 'ftp://example.com/support', valid: false },
      { value: 'mailto:support@example.com', valid: false },
    ])('validates $value consistently at runtime and in JSON Schema', ({ value, valid }) => {
      const config = { [key]: value };
      assert.equal(schema.safeParse(config).success, valid);
      assert.equal(validateJson(config), valid);
    });
  });
});
