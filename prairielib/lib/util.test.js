// @ts-check
const { assert } = require('chai');

const util = require('../lib/util');

function check(input, expected) {
  assert.deepEqual(expected, util.sanitizeObject(input));
}

describe('sanitizeObject', () => {
  it('sanitizes an empty object', () => {
    const input = {};
    const expected = {};
    check(input, expected);
  });

  it('handles null byte in top-level string', () => {
    const input = { test: 'test\u0000ing' };
    const expected = { test: 'test\\u0000ing' };
    check(input, expected);
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
    check(input, expected);
  });

  it('handles null byte in top-level array', () => {
    const input = {
      test: ['testing', 'test\u0000ing'],
    };
    const expected = {
      test: ['testing', 'test\\u0000ing'],
    };
    check(input, expected);
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
    check(input, expected);
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
    check(input, expected);
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
    check(input, expected);
  });
});

describe('recursivelyTruncateStrings', () => {
  it('handles empty object', () => {
    assert.deepEqual(util.recursivelyTruncateStrings({}, 10), {});
  });

  it('handles null and undefined', () => {
    assert.deepEqual(util.recursivelyTruncateStrings({ test: null }, 10), { test: null });
    assert.deepEqual(util.recursivelyTruncateStrings({ test: undefined }, 10), { test: undefined });
  });

  it('handles legal string', () => {
    assert.deepEqual(util.recursivelyTruncateStrings({ test: 'test' }, 10), { test: 'test' });
  });

  it('handles long string', () => {
    assert.deepEqual(util.recursivelyTruncateStrings({ test: 'testtest' }, 4), {
      test: 'test...[truncated]',
    });
  });

  it('handles long string in array', () => {
    assert.deepEqual(util.recursivelyTruncateStrings({ test: ['testtest'] }, 4), {
      test: ['test...[truncated]'],
    });
  });

  it('handles long string in object in array', () => {
    assert.deepEqual(util.recursivelyTruncateStrings({ test: [{ test: 'testtest' }] }, 4), {
      test: [{ test: 'test...[truncated]' }],
    });
  });
});
