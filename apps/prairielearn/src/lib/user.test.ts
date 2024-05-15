import { assert } from 'chai';

import { parseUidsString } from './user.js';

describe('user utilities', () => {
  describe('parseUidsString', () => {
    it('handles empty string', () => {
      assert.deepEqual(parseUidsString('', 10), []);
    });

    it('handles whitespace string', () => {
      assert.deepEqual(parseUidsString(' \n\t', 10), []);
    });

    it('handled empty items', () => {
      assert.deepEqual(parseUidsString(' , ; ', 10), []);
    });

    it('handles single item', () => {
      assert.deepEqual(parseUidsString('a@example.com', 10), ['a@example.com']);
    });

    it('handles multiple items', () => {
      assert.deepEqual(parseUidsString('a@example.com, b@example.com', 10), [
        'a@example.com',
        'b@example.com',
      ]);
    });

    it('handles duplicate items', () => {
      assert.deepEqual(parseUidsString('a@example.com, b@example.com, a@example.com', 10), [
        'a@example.com',
        'b@example.com',
      ]);
    });

    it('throws an error if too many UIDs are provided', () => {
      assert.throws(
        () => parseUidsString('a@example.com, b@example.com, c@example.com', 2),
        'Cannot provide more than 2 UIDs',
      );
    });
  });
});
