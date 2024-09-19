import { assert } from 'chai';

import { formatInterval } from './interval.js';

describe('interval formatting', () => {
  describe('formatInterval()', () => {
    it('should handle seconds', () => {
      assert.equal(formatInterval(7000), '7 s');
    });
    it('should handle fractional seconds', () => {
      assert.equal(formatInterval(7321), '7 s');
    });
    it('should handle minutes', () => {
      assert.equal(formatInterval(2 * 60 * 1000), '2 min');
    });
    it('should handle hours', () => {
      assert.equal(formatInterval(3 * 60 * 60 * 1000), '3 h');
    });
    it('should handle hours', () => {
      assert.equal(formatInterval(4 * 24 * 60 * 60 * 1000), '4 d');
    });
    it('should handle complex intervals', () => {
      assert.equal(formatInterval((((4 * 24 + 3) * 60 + 2) * 60 + 7) * 1000), '4 d 3 h 2 min 7 s');
    });
    it('should handle zero', () => {
      assert.equal(formatInterval(0), '0 s');
    });
    it('should handle negative intervals', () => {
      assert.equal(
        formatInterval(-(((4 * 24 + 3) * 60 + 2) * 60 + 7) * 1000),
        '-4 d -3 h -2 min -7 s',
      );
    });
  });
});
