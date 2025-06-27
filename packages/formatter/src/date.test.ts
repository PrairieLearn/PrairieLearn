import { assert, describe, it } from 'vitest';

import {
  formatDate,
  formatDateFriendly,
  formatDateRangeFriendly,
  formatDateWithinRange,
  formatDateYMD,
  formatDateYMDHM,
} from './date.js';

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

  describe('formatDateWithinRange()', () => {
    it('should handle a date within the same day in UTC', () => {
      const date = new Date(Date.UTC(2018, 0, 1, 12, 34, 7));
      const start = new Date(Date.UTC(2018, 0, 1, 12, 0, 0));
      const end = new Date(Date.UTC(2018, 0, 1, 12, 59, 59));
      assert.equal(formatDateWithinRange(date, start, end, 'UTC'), '12:34');
    });
    it('should handle a date within the same day in CST', () => {
      const date = new Date(Date.UTC(2018, 0, 1, 23, 8, 57));
      const start = new Date(Date.UTC(2018, 0, 1, 21, 0, 0));
      const end = new Date(Date.UTC(2018, 0, 2, 2, 14, 0));
      assert.equal(formatDateWithinRange(date, start, end, 'America/Chicago'), '17:08');
    });
    it('should handle a date within the same year in UTC', () => {
      const date = new Date(Date.UTC(2018, 0, 1, 12, 34, 7));
      const start = new Date(Date.UTC(2018, 0, 1, 12, 0, 0));
      const end = new Date(Date.UTC(2018, 0, 4, 12, 59, 59));
      assert.equal(formatDateWithinRange(date, start, end, 'UTC'), 'Jan 1, 12:34');
    });
    it('should handle a date within different years in UTC', () => {
      const date = new Date(Date.UTC(2018, 0, 1, 12, 34, 7));
      const start = new Date(Date.UTC(2018, 0, 1, 12, 0, 0));
      const end = new Date(Date.UTC(2019, 0, 1, 12, 59, 59));
      assert.equal(formatDateWithinRange(date, start, end, 'UTC'), '2018-01-01 12:34');
    });
  });

  describe('formatDateFriendly()', () => {
    it('should handle a date on the same day at the same time', () => {
      const baseDate = new Date(Date.UTC(2018, 0, 1, 12, 34, 0));
      const date = new Date(Date.UTC(2018, 0, 1, 12, 34, 0));
      assert.equal(formatDateFriendly(date, 'UTC', { baseDate }), 'today, 12:34pm (UTC)');
    });

    it('should handle a date on the same day at a later time', () => {
      const baseDate = new Date(Date.UTC(2018, 0, 1, 12, 34, 0));
      const date = new Date(Date.UTC(2018, 0, 1, 16, 34, 0));
      assert.equal(formatDateFriendly(date, 'UTC', { baseDate }), 'today, 4:34pm (UTC)');
    });

    it('should handle a date on the same day at an earlier time', () => {
      const baseDate = new Date(Date.UTC(2018, 0, 1, 12, 34, 0));
      const date = new Date(Date.UTC(2018, 0, 1, 9, 34, 0));
      assert.equal(formatDateFriendly(date, 'UTC', { baseDate }), 'today, 9:34am (UTC)');
    });

    it('should handle a date on the next day at the same time', () => {
      const baseDate = new Date(Date.UTC(2018, 0, 1, 12, 34, 0));
      const date = new Date(Date.UTC(2018, 0, 2, 12, 34, 0));
      assert.equal(formatDateFriendly(date, 'UTC', { baseDate }), 'tomorrow, 12:34pm (UTC)');
    });

    it('should handle a date on the next day at a later time', () => {
      const baseDate = new Date(Date.UTC(2018, 0, 1, 12, 34, 0));
      const date = new Date(Date.UTC(2018, 0, 2, 16, 34, 0));
      assert.equal(formatDateFriendly(date, 'UTC', { baseDate }), 'tomorrow, 4:34pm (UTC)');
    });

    it('should handle a date on the next day at an earlier time', () => {
      const baseDate = new Date(Date.UTC(2018, 0, 1, 12, 34, 0));
      const date = new Date(Date.UTC(2018, 0, 2, 9, 34, 0));
      assert.equal(formatDateFriendly(date, 'UTC', { baseDate }), 'tomorrow, 9:34am (UTC)');
    });

    it('should handle a date on the previous day at the same time', () => {
      const baseDate = new Date(Date.UTC(2018, 0, 1, 12, 34, 0));
      const date = new Date(Date.UTC(2017, 11, 31, 12, 34, 0));
      assert.equal(formatDateFriendly(date, 'UTC', { baseDate }), 'yesterday, 12:34pm (UTC)');
    });

    it('should handle a date on the previous day at a later time', () => {
      const baseDate = new Date(Date.UTC(2018, 0, 1, 12, 34, 0));
      const date = new Date(Date.UTC(2017, 11, 31, 16, 34, 0));
      assert.equal(formatDateFriendly(date, 'UTC', { baseDate }), 'yesterday, 4:34pm (UTC)');
    });

    it('should handle a date on the previous day at an earlier time', () => {
      const baseDate = new Date(Date.UTC(2018, 0, 1, 12, 34, 0));
      const date = new Date(Date.UTC(2017, 11, 31, 9, 34, 0));
      assert.equal(formatDateFriendly(date, 'UTC', { baseDate }), 'yesterday, 9:34am (UTC)');
    });

    it('should handle a date in the near future', () => {
      const baseDate = new Date(Date.UTC(2018, 0, 1, 12, 34, 0));
      const date = new Date(Date.UTC(2018, 3, 15, 0, 34, 0));
      assert.equal(
        formatDateFriendly(date, 'UTC', { baseDate }),
        'Sun, Apr\u00a015, 12:34am (UTC)',
      );
    });

    it('should handle a date in the far future', () => {
      const baseDate = new Date(Date.UTC(2018, 0, 1, 12, 34, 0));
      const date = new Date(Date.UTC(2018, 9, 15, 0, 34, 0));
      assert.equal(
        formatDateFriendly(date, 'UTC', { baseDate }),
        'Mon, Oct\u00a015, 2018, 12:34am (UTC)',
      );
    });

    it('should handle a date in the near past', () => {
      const baseDate = new Date(Date.UTC(2018, 0, 1, 12, 34, 0));
      const date = new Date(Date.UTC(2017, 9, 15, 0, 34, 0));
      assert.equal(
        formatDateFriendly(date, 'UTC', { baseDate }),
        'Sun, Oct\u00a015, 12:34am (UTC)',
      );
    });

    it('should handle a date in the far past', () => {
      const baseDate = new Date(Date.UTC(2018, 0, 1, 12, 34, 0));
      const date = new Date(Date.UTC(2017, 3, 15, 0, 34, 0));
      assert.equal(
        formatDateFriendly(date, 'UTC', { baseDate }),
        'Sat, Apr\u00a015, 2017, 12:34am (UTC)',
      );
    });

    it('should display without the timezone', () => {
      const baseDate = new Date(Date.UTC(2018, 0, 1, 12, 34, 0));
      const date = new Date(Date.UTC(2018, 3, 15, 0, 34, 0));
      assert.equal(
        formatDateFriendly(date, 'UTC', { baseDate, includeTz: false }),
        'Sun, Apr\u00a015, 12:34am',
      );
    });

    it('should handle a date in CDT', () => {
      const baseDate = new Date(Date.UTC(2018, 0, 1, 12, 34, 0));
      const date = new Date(Date.UTC(2018, 3, 15, 0, 34, 0));
      assert.equal(
        formatDateFriendly(date, 'America/Chicago', { baseDate }),
        'Sat, Apr\u00a014, 7:34pm (CDT)',
      );
    });

    it('should handle a date in CDT without the timezone', () => {
      const baseDate = new Date(Date.UTC(2018, 0, 1, 12, 34, 0));
      const date = new Date(Date.UTC(2018, 3, 15, 0, 34, 0));
      assert.equal(
        formatDateFriendly(date, 'America/Chicago', { baseDate, includeTz: false }),
        'Sat, Apr\u00a014, 7:34pm',
      );
    });

    it('should handle displaying only the date', () => {
      const baseDate = new Date(Date.UTC(2018, 0, 1, 12, 34, 0));
      const date = new Date(Date.UTC(2018, 3, 15, 0, 34, 0));
      assert.equal(
        formatDateFriendly(date, 'UTC', { baseDate, dateOnly: true }),
        'Sun, Apr\u00a015 (UTC)',
      );
    });

    it('should handle displaying only the date without the timezone', () => {
      const baseDate = new Date(Date.UTC(2018, 0, 1, 12, 34, 0));
      const date = new Date(Date.UTC(2018, 3, 15, 0, 34, 0));
      assert.equal(
        formatDateFriendly(date, 'UTC', { baseDate, dateOnly: true, includeTz: false }),
        'Sun, Apr\u00a015',
      );
    });

    it('should handle displaying only the time', () => {
      const baseDate = new Date(Date.UTC(2018, 0, 1, 12, 34, 0));
      const date = new Date(Date.UTC(2018, 3, 15, 0, 34, 0));
      assert.equal(formatDateFriendly(date, 'UTC', { baseDate, timeOnly: true }), '12:34am (UTC)');
    });

    it('should handle displaying only the time without the timezone', () => {
      const baseDate = new Date(Date.UTC(2018, 0, 1, 12, 34, 0));
      const date = new Date(Date.UTC(2018, 3, 15, 0, 34, 0));
      assert.equal(
        formatDateFriendly(date, 'UTC', { baseDate, timeOnly: true, includeTz: false }),
        '12:34am',
      );
    });

    it('should handle displaying dates with the time first', () => {
      const baseDate = new Date(Date.UTC(2018, 0, 1, 12, 34, 0));
      const date = new Date(Date.UTC(2018, 3, 15, 0, 34, 0));
      assert.equal(
        formatDateFriendly(date, 'UTC', { baseDate, timeFirst: true }),
        '12:34am Sun, Apr\u00a015 (UTC)',
      );
    });

    it('should handle a time with seconds', () => {
      const baseDate = new Date(Date.UTC(2018, 0, 1, 12, 34, 2));
      const date = new Date(Date.UTC(2018, 0, 1, 13, 34, 7));
      assert.equal(formatDateFriendly(date, 'UTC', { baseDate }), 'today, 1:34:07pm (UTC)');
    });

    it('should handle a time with minutes', () => {
      const baseDate = new Date(Date.UTC(2018, 0, 1, 12, 34, 2));
      const date = new Date(Date.UTC(2018, 0, 1, 13, 34, 0));
      assert.equal(formatDateFriendly(date, 'UTC', { baseDate }), 'today, 1:34pm (UTC)');
    });

    it('should handle a time with hours', () => {
      const baseDate = new Date(Date.UTC(2018, 0, 1, 12, 34, 2));
      const date = new Date(Date.UTC(2018, 0, 1, 13, 0, 0));
      assert.equal(formatDateFriendly(date, 'UTC', { baseDate }), 'today, 1pm (UTC)');
    });

    it('should handle midnight', () => {
      const baseDate = new Date(Date.UTC(2018, 0, 1, 12, 34, 2));
      const date = new Date(Date.UTC(2018, 0, 1, 0, 0, 0));
      assert.equal(formatDateFriendly(date, 'UTC', { baseDate }), 'today, 12am (UTC)');
    });

    it('should handle noon', () => {
      const baseDate = new Date(Date.UTC(2018, 0, 1, 12, 34, 2));
      const date = new Date(Date.UTC(2018, 0, 1, 12, 0, 0));
      assert.equal(formatDateFriendly(date, 'UTC', { baseDate }), 'today, 12pm (UTC)');
    });
  });

  describe('formatDateRangeFriendly()', () => {
    it('should handle two different dates', () => {
      const baseDate = new Date(Date.UTC(2018, 0, 1, 12, 34, 0));
      const start = new Date(Date.UTC(2018, 0, 1, 12, 34, 0));
      const end = new Date(Date.UTC(2018, 0, 3, 10, 0, 0));
      assert.equal(
        formatDateRangeFriendly(start, end, 'UTC', { baseDate }),
        'today, 12:34pm to Wed, Jan\u00a03, 10am (UTC)',
      );
    });

    it('should handle the same date with different times', () => {
      const baseDate = new Date(Date.UTC(2018, 0, 1, 12, 34, 0));
      const start = new Date(Date.UTC(2018, 0, 1, 12, 34, 0));
      const end = new Date(Date.UTC(2018, 0, 1, 13, 0, 0));
      assert.equal(
        formatDateRangeFriendly(start, end, 'UTC', { baseDate }),
        'today, 12:34pm to 1pm (UTC)',
      );
    });

    it('should handle the same date with the same time', () => {
      const baseDate = new Date(Date.UTC(2018, 0, 1, 12, 34, 0));
      const start = new Date(Date.UTC(2018, 0, 1, 12, 34, 0));
      const end = new Date(Date.UTC(2018, 0, 1, 12, 34, 0));
      assert.equal(
        formatDateRangeFriendly(start, end, 'UTC', { baseDate }),
        'today, 12:34pm (UTC)',
      );
    });

    it('should handle two different dates with the time first', () => {
      const baseDate = new Date(Date.UTC(2018, 0, 1, 12, 34, 0));
      const start = new Date(Date.UTC(2018, 0, 1, 12, 34, 0));
      const end = new Date(Date.UTC(2018, 0, 3, 10, 0, 0));
      assert.equal(
        formatDateRangeFriendly(start, end, 'UTC', { baseDate, timeFirst: true }),
        '12:34pm today to 10am Wed, Jan\u00a03 (UTC)',
      );
    });

    it('should handle the same date with different times with the time first', () => {
      const baseDate = new Date(Date.UTC(2018, 0, 1, 12, 34, 0));
      const start = new Date(Date.UTC(2018, 0, 1, 12, 34, 0));
      const end = new Date(Date.UTC(2018, 0, 1, 13, 0, 0));
      assert.equal(
        formatDateRangeFriendly(start, end, 'UTC', { baseDate, timeFirst: true }),
        '12:34pm to 1pm today (UTC)',
      );
    });

    it('should handle the same date with the same time and the time first', () => {
      const baseDate = new Date(Date.UTC(2018, 0, 1, 12, 34, 0));
      const start = new Date(Date.UTC(2018, 0, 1, 12, 34, 0));
      const end = new Date(Date.UTC(2018, 0, 1, 12, 34, 0));
      assert.equal(
        formatDateRangeFriendly(start, end, 'UTC', { baseDate, timeFirst: true }),
        '12:34pm today (UTC)',
      );
    });

    it('should handle two different dates without the timezone', () => {
      const baseDate = new Date(Date.UTC(2018, 0, 1, 12, 34, 0));
      const start = new Date(Date.UTC(2018, 0, 1, 12, 34, 0));
      const end = new Date(Date.UTC(2018, 0, 3, 10, 0, 0));
      assert.equal(
        formatDateRangeFriendly(start, end, 'UTC', { baseDate, includeTz: false }),
        'today, 12:34pm to Wed, Jan\u00a03, 10am',
      );
    });

    it('should handle two different dates with only dates and without the timezone', () => {
      const baseDate = new Date(Date.UTC(2018, 0, 1, 12, 34, 0));
      const start = new Date(Date.UTC(2018, 0, 1, 12, 34, 0));
      const end = new Date(Date.UTC(2018, 0, 3, 10, 0, 0));
      assert.equal(
        formatDateRangeFriendly(start, end, 'UTC', {
          baseDate,
          dateOnly: true,
          includeTz: false,
        }),
        'today to Wed, Jan\u00a03',
      );
    });

    it('should handle two different dates with time first and without the timezone', () => {
      const baseDate = new Date(Date.UTC(2018, 0, 1, 12, 34, 0));
      const start = new Date(Date.UTC(2018, 0, 1, 12, 34, 0));
      const end = new Date(Date.UTC(2018, 0, 3, 10, 0, 0));
      assert.equal(
        formatDateRangeFriendly(start, end, 'UTC', {
          baseDate,
          timeFirst: true,
          includeTz: false,
        }),
        '12:34pm today to 10am Wed, Jan\u00a03',
      );
    });

    it('should handle two different dates in CST', () => {
      const baseDate = new Date(Date.UTC(2018, 0, 1, 12, 34, 0));
      const start = new Date(Date.UTC(2018, 0, 1, 0, 34, 0));
      const end = new Date(Date.UTC(2018, 0, 3, 10, 0, 0));
      assert.equal(
        formatDateRangeFriendly(start, end, 'America/Chicago', { baseDate }),
        'yesterday, 6:34pm to Wed, Jan\u00a03, 4am (CST)',
      );
    });

    it('should handle two different dates in CDT without the timezone', () => {
      const baseDate = new Date(Date.UTC(2018, 0, 1, 12, 34, 0));
      const start = new Date(Date.UTC(2018, 0, 1, 0, 34, 0));
      const end = new Date(Date.UTC(2018, 0, 3, 10, 0, 0));
      assert.equal(
        formatDateRangeFriendly(start, end, 'America/Chicago', {
          baseDate,
          includeTz: false,
        }),
        'yesterday, 6:34pm to Wed, Jan\u00a03, 4am',
      );
    });
  });
});
