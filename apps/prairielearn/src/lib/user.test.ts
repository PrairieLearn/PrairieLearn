import { assert } from 'chai';
import { parseUidsString } from './user';

describe('user utilities', () => {
  describe('parseUidsString', () => {
    it('handles empty string', () => {
      assert.deepEqual(parseUidsString(''), []);
    });

    it('handles whitespace string', () => {
      assert.deepEqual(parseUidsString(' \n\t'), []);
    });

    it('handled empty items', () => {
      assert.deepEqual(parseUidsString(' , ; '), []);
    });

    it('handles single item', () => {
      assert.deepEqual(parseUidsString('a@example.com'), ['a@example.com']);
    });

    it('handles multiple items', () => {
      assert.deepEqual(parseUidsString('a@example.com, b@example.com'), [
        'a@example.com',
        'b@example.com',
      ]);
    });

    it('handles duplicate items', () => {
      assert.deepEqual(parseUidsString('a@example.com, b@example.com, a@example.com'), [
        'a@example.com',
        'b@example.com',
      ]);
    });
  });
});
