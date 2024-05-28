import { assert } from 'chai';

import { formatDate } from './date.js';

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
});
