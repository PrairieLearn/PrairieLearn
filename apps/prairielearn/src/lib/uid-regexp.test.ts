import { assert, describe, it } from 'vitest';

import { UidRegexpSchema } from './uid-regexp.js';

describe('UID regexp validation', () => {
  it('accepts blank UID regexps', () => {
    assert.isTrue(UidRegexpSchema.safeParse('').success);
    assert.deepEqual(UidRegexpSchema.parse('   '), '');
  });

  it('accepts valid UID regexps', () => {
    assert.deepEqual(UidRegexpSchema.parse('  @example\\.com$  '), '@example\\.com$');
    assert.deepEqual(
      UidRegexpSchema.parse('@(student\\.|)example\\.edu$'),
      '@(student\\.|)example\\.edu$',
    );
  });

  it('rejects invalid UID regexps', () => {
    const result = UidRegexpSchema.safeParse('@uot\\.edu.\\ly$');
    assert.isFalse(result.success);
  });

  it('rejects UID regexps that do not start with @ and end with $', () => {
    assert.isFalse(UidRegexpSchema.safeParse('example.edu').success);
    assert.isFalse(UidRegexpSchema.safeParse('@example\\.edu@').success);
  });

  it('rejects UID regexps with unescaped periods', () => {
    assert.isFalse(UidRegexpSchema.safeParse('@example.com$').success);
    assert.isFalse(UidRegexpSchema.safeParse('@example.\\edu$').success);
    assert.isFalse(UidRegexpSchema.safeParse('@(student\\.|)example.edu$').success);
  });
});
