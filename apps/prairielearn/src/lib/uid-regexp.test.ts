import { assert, describe, it } from 'vitest';

import { UidRegexpSchema } from './uid-regexp.js';

describe('UID regexp validation', () => {
  it('accepts blank UID regexps', () => {
    assert.isTrue(UidRegexpSchema.safeParse('').success);
    assert.deepEqual(UidRegexpSchema.parse('   '), '');
  });

  it('accepts valid UID regexps', () => {
    assert.deepEqual(UidRegexpSchema.parse('  @example\\.com$  '), '@example\\.com$');
  });

  it('rejects invalid UID regexps', () => {
    const result = UidRegexpSchema.safeParse('@uot\\.edu.\\ly$');
    assert.isFalse(result.success);
  });
});
