/* eslint-env jest */
const util = require('../lib/util');

function check(input, expected) {
  expect(expected).toEqual(util.sanitizeObject(input));
}

describe('sanitizeObject', () => {
  test('empty object', () => {
    const input = {};
    const expected = {};
    check(input, expected);
  });

  test('null byte in top-level string', () => {
    const input = { test: 'test\u0000ing' };
    const expected = { test: 'test\\u0000ing'};
    check(input, expected);
  });

  test('null byte in nested string', () => {
    const input = {
      test: {
        nestedTest: 'test\u0000ing'
      }
    };
    const expected = {
      test: {
        nestedTest: 'test\\u0000ing'
      }
    };
    check(input, expected);
  });

  test('null byte in top-level array', () => {
    const input = {
      test: ['testing', 'test\u0000ing']
    };
    const expected = {
      test: ['testing', 'test\\u0000ing']
    };
    check(input, expected);
  });

  test('null byte in nested array', () => {
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

  test('handles numbers correctly', () => {
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
});
