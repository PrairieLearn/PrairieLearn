import { assert } from 'chai';

import { sanitizeObject, recursivelyTruncateStrings } from './index';

describe('sanitizeObject', () => {
  it('sanitizes an empty object', () => {
    const input = {};
    const expected = {};
    assert.deepEqual(expected, sanitizeObject(input));
  });

  it('handles null byte in top-level string', () => {
    const input = { test: 'test\u0000ing' };
    const expected = { test: 'test\\u0000ing' };
    assert.deepEqual(expected, sanitizeObject(input));
  });

  it('handles null byte in nested string', () => {
    const input = {
      test: {
        nestedTest: 'test\u0000ing',
      },
    };
    const expected = {
      test: {
        nestedTest: 'test\\u0000ing',
      },
    };
    assert.deepEqual(expected, sanitizeObject(input));
  });

  it('handles null byte in top-level array', () => {
    const input = {
      test: ['testing', 'test\u0000ing'],
    };
    const expected = {
      test: ['testing', 'test\\u0000ing'],
    };
    assert.deepEqual(expected, sanitizeObject(input));
  });

  it('handles null byte in nested array', () => {
    const input = {
      test: {
        test2: ['testing', 'test\u0000ing'],
      },
    };
    const expected = {
      test: {
        test2: ['testing', 'test\\u0000ing'],
      },
    };
    assert.deepEqual(expected, sanitizeObject(input));
  });

  it('handles numbers correctly', () => {
    const input = {
      test: 'test\u0000ing',
      a: 1,
      b: 2.45,
    };
    const expected = {
      test: 'test\\u0000ing',
      a: 1,
      b: 2.45,
    };
    assert.deepEqual(expected, sanitizeObject(input));
  });

  it('handles null values correctly', () => {
    const input = {
      test: 'test\u0000ing',
      a: null,
    };
    const expected = {
      test: 'test\\u0000ing',
      a: null,
    };
    assert.deepEqual(expected, sanitizeObject(input));
  });
});

describe('recursivelyTruncateStrings', () => {
  it('handles empty object', () => {
    assert.deepEqual(recursivelyTruncateStrings({}, 10), {});
  });

  it('handles null and undefined', () => {
    assert.deepEqual(recursivelyTruncateStrings({ test: null }, 10), { test: null });
    assert.deepEqual(recursivelyTruncateStrings({ test: undefined }, 10), { test: undefined });
  });

  it('handles legal string', () => {
    assert.deepEqual(recursivelyTruncateStrings({ test: 'test' }, 10), { test: 'test' });
  });

  it('handles long string', () => {
    assert.deepEqual(recursivelyTruncateStrings({ test: 'testtest' }, 4), {
      test: 'test...[truncated]',
    });
  });

  it('handles long string in array', () => {
    assert.deepEqual(recursivelyTruncateStrings({ test: ['testtest'] }, 4), {
      test: ['test...[truncated]'],
    });
  });

  it('handles long string in object in array', () => {
    assert.deepEqual(recursivelyTruncateStrings({ test: [{ test: 'testtest' }] }, 4), {
      test: [{ test: 'test...[truncated]' }],
    });
  });
});
