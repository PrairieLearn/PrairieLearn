import { assert, describe, it } from 'vitest';

import {
  formatInterval,
  formatIntervalHM,
  formatIntervalMinutes,
  formatIntervalRelative,
  makeInterval,
} from './interval.js';

describe('interval formatting', () => {
  describe('formatInterval()', () => {
    it('should handle seconds', () => {
      assert.equal(formatInterval(7000), '7s');
    });
    it('should handle fractional seconds', () => {
      assert.equal(formatInterval(7321), '7s');
    });
    it('should handle minutes', () => {
      assert.equal(formatInterval(2 * 60 * 1000), '2min');
    });
    it('should handle hours', () => {
      assert.equal(formatInterval(3 * 60 * 60 * 1000), '3h');
    });
    it('should handle days', () => {
      assert.equal(formatInterval(4 * 24 * 60 * 60 * 1000), '4d');
    });
    it('should handle complex intervals', () => {
      assert.equal(formatInterval((((4 * 24 + 3) * 60 + 2) * 60 + 7) * 1000), '4d 3h 2min 7s');
    });
    it('should handle zero', () => {
      assert.equal(formatInterval(0), '0s');
    });
    it('should handle negative intervals', () => {
      assert.equal(formatInterval(-(((4 * 24 + 3) * 60 + 2) * 60 + 7) * 1000), '-4d -3h -2min -7s');
    });
  });
  describe('formatIntervalRelative()', () => {
    it('should handle positive intervals', () => {
      assert.equal(
        formatIntervalRelative(3 * 1000, 'Until', 'the start time'),
        'Until 3s after the start time',
      );
    });
    it('should handle negative intervals', () => {
      assert.equal(
        formatIntervalRelative(-7 * 60 * 1000, 'From', 'the start time'),
        'From 7min before the start time',
      );
    });
    it('should handle zero intervals', () => {
      assert.equal(formatIntervalRelative(0, 'From', 'the start time'), 'From the start time');
    });
  });

  describe('formatIntervalMinutes()', () => {
    it('should correctly round up', () => {
      assert.equal(formatIntervalMinutes(3.2 * 60 * 1000), '4 minutes');
    });
    it('should correctly handle 1 minute', () => {
      assert.equal(formatIntervalMinutes(17 * 1000), '1 minute');
    });
    it('should correctly handle zero', () => {
      assert.equal(formatIntervalMinutes(0), '0 minutes');
    });
    it('should correctly handle -1 minute', () => {
      assert.equal(formatIntervalMinutes(-17 * 1000), '-1 minute');
    });
    it('should correctly handle negative intervals', () => {
      assert.equal(formatIntervalMinutes(-3.2 * 60 * 1000), '-4 minutes');
    });
  });

  describe('formatIntervalHM()', () => {
    it('should correctly handle positive minutes', () => {
      assert.equal(formatIntervalHM(3.2 * 60 * 1000), '00:03');
    });
    it('should correctly handle positive hours', () => {
      assert.equal(formatIntervalHM((4 * 60 + 17.8) * 60 * 1000), '04:17');
    });
    it('should correctly handle large positive hours', () => {
      assert.equal(formatIntervalHM((143 * 60 + 17.8) * 60 * 1000), '143:17');
    });
    it('should correctly handle an explicit sign', () => {
      assert.equal(formatIntervalHM((4 * 60 + 17.8) * 60 * 1000, { signed: true }), '+04:17');
    });
    it('should correctly handle negative minutes', () => {
      assert.equal(formatIntervalHM(-3.2 * 60 * 1000), '-00:03');
    });
    it('should correctly handle negative hours', () => {
      assert.equal(formatIntervalHM(-(4 * 60 + 17.8) * 60 * 1000), '-04:17');
    });
  });

  describe('makeInterval()', () => {
    it('should handle seconds', () => {
      assert.equal(makeInterval({ seconds: 7 }), 7 * 1000);
    });
    it('should handle minutes', () => {
      assert.equal(makeInterval({ minutes: 2 }), 2 * 60 * 1000);
    });
    it('should handle hours', () => {
      assert.equal(makeInterval({ hours: 3 }), 3 * 60 * 60 * 1000);
    });
    it('should handle days', () => {
      assert.equal(makeInterval({ days: 4 }), 4 * 24 * 60 * 60 * 1000);
    });
    it('should default to zero', () => {
      assert.equal(makeInterval({}), 0);
    });
  });
});
