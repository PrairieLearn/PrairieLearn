import { assert, describe, it } from 'vitest';

import { parseUniqueValuesFromString } from './user.js';

describe('user utilities', () => {
  describe('parseUniqueValuesFromString', () => {
    it('handles empty string', () => {
      assert.deepEqual(parseUniqueValuesFromString('', 10), []);
    });

    it('handles whitespace string', () => {
      assert.deepEqual(parseUniqueValuesFromString(' \n\t', 10), []);
    });

    it('handled empty items', () => {
      assert.deepEqual(parseUniqueValuesFromString(' , ; ', 10), []);
    });

    it('handles single item', () => {
      assert.deepEqual(parseUniqueValuesFromString('a@example.com', 10), ['a@example.com']);
    });

    it('handles multiple items', () => {
      assert.deepEqual(parseUniqueValuesFromString('a@example.com, b@example.com', 10), [
        'a@example.com',
        'b@example.com',
      ]);
    });

    it('handles duplicate items', () => {
      assert.deepEqual(
        parseUniqueValuesFromString('a@example.com, b@example.com, a@example.com', 10),
        ['a@example.com', 'b@example.com'],
      );
    });

    it('throws an error if too many values are provided', () => {
      assert.throws(
        () => parseUniqueValuesFromString('a@example.com, b@example.com, c@example.com', 2),
        'Cannot provide more than 2 values',
      );
    });
  });
});
