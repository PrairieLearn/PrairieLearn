import { assert } from 'chai';

import { formatDate, formatDateYMD, formatDateYMDHM } from './date.js';

describe('date formatting', () => {
  describe('formatDate', () => {
    it('formats a UTC date', () => {
      const date = new Date(Date.UTC(2018, 0, 1, 12, 0, 0));
      assert.equal(formatDate(date, 'UTC'), '2018-01-01 12:00:00 (UTC)');
    });
    it('formats a CST date', () => {
      const date = new Date(Date.UTC(2018, 0, 1, 12, 0, 0));
      assert.equal(formatDate(date, 'America/Chicago'), '2018-01-01 06:00:00 (CST)');
    });
    it('formats a CDT date', () => {
      const date = new Date(Date.UTC(2018, 6, 1, 12, 0, 0));
      assert.equal(formatDate(date, 'America/Chicago'), '2018-07-01 07:00:00 (CDT)');
    });
    it('formats dates with zero hours', () => {
      const date = new Date(Date.UTC(2018, 0, 1, 0, 1, 0));
      assert.equal(formatDate(date, 'UTC'), '2018-01-01 00:01:00 (UTC)');
    });
    it('formats dates with milliseconds', () => {
      const date = new Date(Date.UTC(2018, 0, 1, 4, 1, 3, 12));
      assert.equal(formatDate(date, 'UTC', { includeMs: true }), '2018-01-01 04:01:03.012 (UTC)');
    });
    it('formats dates without the timezone', () => {
      const date = new Date(Date.UTC(2018, 0, 1, 12, 0, 0));
      assert.equal(formatDate(date, 'UTC', { includeTz: false }), '2018-01-01 12:00:00');
    });
    it('formats dates with the long timezone name', () => {
      const date = new Date(Date.UTC(2018, 0, 1, 12, 0, 0));
      assert.equal(
        formatDate(date, 'America/Chicago', { longTz: true }),
        '2018-01-01 06:00:00 (Central Standard Time)',
      );
    });
  });

  describe('formatDateYMD()', () => {
    it('should handle a UTC date', () => {
      const date = new Date(Date.UTC(2018, 0, 1, 12, 0, 0));
      assert.equal(formatDateYMD(date, 'UTC'), '2018-01-01');
    });
    it('should handle a CST date', () => {
      const date = new Date(Date.UTC(2018, 0, 3, 5, 0, 0));
      assert.equal(formatDateYMD(date, 'America/Chicago'), '2018-01-02');
    });
    it('should handle a CDT date', () => {
      const date = new Date(Date.UTC(2018, 6, 1, 12, 0, 0));
      assert.equal(formatDateYMD(date, 'America/Chicago'), '2018-07-01');
    });
    it('should correctly format dates with zero hours', () => {
      const date = new Date(Date.UTC(2018, 0, 1, 0, 1, 0));
      assert.equal(formatDateYMD(date, 'UTC'), '2018-01-01');
    });
  });

  describe('formatDateYMDHM()', () => {
    it('should handle a UTC date', () => {
      const date = new Date(Date.UTC(2018, 0, 1, 12, 34, 7));
      assert.equal(formatDateYMDHM(date, 'UTC'), '2018-01-01 12:34');
    });
    it('should handle a CST date', () => {
      const date = new Date(Date.UTC(2018, 0, 3, 5, 10, 50));
      assert.equal(formatDateYMDHM(date, 'America/Chicago'), '2018-01-02 23:10');
    });
    it('should handle a CDT date', () => {
      const date = new Date(Date.UTC(2018, 6, 1, 19, 8, 19));
      assert.equal(formatDateYMDHM(date, 'America/Chicago'), '2018-07-01 14:08');
    });
    it('should correctly format dates with zero hours', () => {
      const date = new Date(Date.UTC(2018, 0, 1, 0, 1, 0));
      assert.equal(formatDateYMDHM(date, 'UTC'), '2018-01-01 00:01');
    });
  });
});
