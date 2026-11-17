import { assert, describe, it } from 'vitest';

import {
  formatDate,
  formatDateFriendly,
  formatDateISO,
  formatDateRangeFriendly,
  formatDateWithinRange,
  formatDateYMD,
  formatDateYMDHM,
} from './date.js';

describe('date formatting', () => {
  describe('formatDate', () => {
    it('formats a UTC date', () => {
      const date1 = new Date(Date.UTC(2018, 0, 1, 12, 0, 0));
      const date2 = new Date(Date.UTC(2023, 0, 1, 18, 59, 32));
      assert.equal(formatDate(date1, 'UTC'), '2018-01-01 12:00:00 (UTC)');
      assert.equal(formatDate(date2, 'UTC'), '2023-01-01 18:59:32 (UTC)');
    });
    it('formats a CST date', () => {
      const date1 = new Date(Date.UTC(2018, 0, 1, 12, 0, 0));
      const date2 = new Date(Date.UTC(2023, 0, 1, 20, 59, 32));
      assert.equal(formatDate(date1, 'America/Chicago'), '2018-01-01 06:00:00 (CST)');
      assert.equal(formatDate(date2, 'America/Chicago'), '2023-01-01 14:59:32 (CST)');
    });
    it('formats a CDT date', () => {
      const date1 = new Date(Date.UTC(2018, 6, 1, 12, 0, 0));
      const date2 = new Date(Date.UTC(2023, 6, 1, 18, 59, 32));
      assert.equal(formatDate(date1, 'America/Chicago'), '2018-07-01 07:00:00 (CDT)');
      assert.equal(formatDate(date2, 'America/Chicago'), '2023-07-01 13:59:32 (CDT)');
    });
    it('formats dates with zero hours', () => {
      const date = new Date(Date.UTC(2018, 0, 1, 0, 1, 0));
      assert.equal(formatDate(date, 'UTC'), '2018-01-01 00:01:00 (UTC)');
    });
    it('formats dates with milliseconds', () => {
      const date1 = new Date(Date.UTC(2018, 0, 1, 4, 1, 3, 12));
      const date2 = new Date(Date.UTC(2023, 0, 1, 18, 59, 32, 456));
      assert.equal(formatDate(date1, 'UTC', { includeMs: true }), '2018-01-01 04:01:03.012 (UTC)');
      assert.equal(formatDate(date2, 'UTC', { includeMs: true }), '2023-01-01 18:59:32.456 (UTC)');
    });
    it('formats dates without the timezone', () => {
      const date1 = new Date(Date.UTC(2018, 0, 1, 12, 0, 0));
      const date2 = new Date(Date.UTC(2023, 0, 1, 18, 59, 32));
      assert.equal(formatDate(date1, 'UTC', { includeTz: false }), '2018-01-01 12:00:00');
      assert.equal(formatDate(date2, 'UTC', { includeTz: false }), '2023-01-01 18:59:32');
    });
    it('formats dates with the long timezone name', () => {
      const date1 = new Date(Date.UTC(2018, 0, 1, 12, 0, 0));
      const date2 = new Date(Date.UTC(2023, 0, 1, 20, 59, 32));
      assert.equal(
        formatDate(date1, 'America/Chicago', { longTz: true }),
        '2018-01-01 06:00:00 (Central Standard Time)',
      );
      assert.equal(
        formatDate(date2, 'America/Chicago', { longTz: true }),
        '2023-01-01 14:59:32 (Central Standard Time)',
      );
    });
  });

  describe('formatDateISO', () => {
    it('returns null for a null date', () => {
      assert.isNull(formatDateISO(null, 'UTC'));
    });

    it('formats a UTC date with timezone offset', () => {
      const date1 = new Date(Date.UTC(2018, 0, 1, 12, 0, 0));
      const date2 = new Date(Date.UTC(2023, 0, 1, 18, 59, 32));
      assert.equal(formatDateISO(date1, 'UTC'), '2018-01-01T12:00:00+00:00');
      assert.equal(formatDateISO(date2, 'UTC'), '2023-01-01T18:59:32+00:00');
    });

    it('formats a CST date with timezone offset', () => {
      const date1 = new Date(Date.UTC(2018, 0, 1, 12, 0, 0));
      const date2 = new Date(Date.UTC(2023, 0, 1, 20, 59, 32));
      assert.equal(formatDateISO(date1, 'America/Chicago'), '2018-01-01T06:00:00-06:00');
      assert.equal(formatDateISO(date2, 'America/Chicago'), '2023-01-01T14:59:32-06:00');
    });

    it('formats a date in Asia/Kolkata with timezone offset', () => {
      const date1 = new Date(Date.UTC(2018, 0, 1, 12, 0, 0));
      const date2 = new Date(Date.UTC(2023, 0, 1, 19, 59, 32));
      assert.equal(formatDateISO(date1, 'Asia/Kolkata'), '2018-01-01T17:30:00+05:30');
      assert.equal(formatDateISO(date2, 'Asia/Kolkata'), '2023-01-02T01:29:32+05:30');
    });

    it('formats a date in Asia/Tokyo with timezone offset', () => {
      const date1 = new Date(Date.UTC(2018, 0, 1, 12, 0, 0));
      const date2 = new Date(Date.UTC(2023, 0, 1, 18, 59, 32));
      assert.equal(formatDateISO(date1, 'Asia/Tokyo'), '2018-01-01T21:00:00+09:00');
      assert.equal(formatDateISO(date2, 'Asia/Tokyo'), '2023-01-02T03:59:32+09:00');
    });

    it('formats a date with milliseconds', () => {
      const date1 = new Date(Date.UTC(2018, 0, 1, 4, 1, 3, 12));
      const date2 = new Date(Date.UTC(2023, 0, 1, 18, 59, 32, 456));
      assert.equal(
        formatDateISO(date1, 'UTC', { includeMs: true }),
        '2018-01-01T04:01:03.012+00:00',
      );
      assert.equal(
        formatDateISO(date2, 'UTC', { includeMs: true }),
        '2023-01-01T18:59:32.456+00:00',
      );
    });

    it('formats a date without the timezone', () => {
      const date1 = new Date(Date.UTC(2018, 0, 1, 12, 0, 0));
      const date2 = new Date(Date.UTC(2023, 0, 1, 18, 59, 32));
      assert.equal(formatDateISO(date1, 'UTC', { includeTz: false }), '2018-01-01T12:00:00');
      assert.equal(formatDateISO(date2, 'UTC', { includeTz: false }), '2023-01-01T18:59:32');
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
      const date1 = new Date(Date.UTC(2018, 0, 1, 12, 34, 7));
      const date2 = new Date(Date.UTC(2023, 0, 1, 18, 59, 32));
      assert.equal(formatDateYMDHM(date1, 'UTC'), '2018-01-01 12:34');
      assert.equal(formatDateYMDHM(date2, 'UTC'), '2023-01-01 18:59');
    });
    it('should handle a CST date', () => {
      const date1 = new Date(Date.UTC(2018, 0, 3, 5, 10, 50));
      const date2 = new Date(Date.UTC(2023, 0, 1, 15, 59, 32));
      assert.equal(formatDateYMDHM(date1, 'America/Chicago'), '2018-01-02 23:10');
      assert.equal(formatDateYMDHM(date2, 'America/Chicago'), '2023-01-01 09:59');
    });
    it('should handle a CDT date', () => {
      const date1 = new Date(Date.UTC(2018, 6, 1, 19, 8, 19));
      const date2 = new Date(Date.UTC(2023, 6, 1, 15, 59, 32));
      assert.equal(formatDateYMDHM(date1, 'America/Chicago'), '2018-07-01 14:08');
      assert.equal(formatDateYMDHM(date2, 'America/Chicago'), '2023-07-01 10:59');
    });
    it('should correctly format dates with zero hours', () => {
      const date = new Date(Date.UTC(2018, 0, 1, 0, 1, 0));
      assert.equal(formatDateYMDHM(date, 'UTC'), '2018-01-01 00:01');
    });
  });

  describe('formatDateWithinRange()', () => {
    it('should handle a date within the same day in UTC', () => {
      const date1 = new Date(Date.UTC(2018, 0, 1, 12, 34, 7));
      const date2 = new Date(Date.UTC(2018, 0, 1, 19, 58, 31));
      const start = new Date(Date.UTC(2018, 0, 1, 12, 0, 0));
      const end = new Date(Date.UTC(2018, 0, 1, 12, 59, 59));
      assert.equal(formatDateWithinRange(date1, start, end, 'UTC'), '12:34');
      assert.equal(formatDateWithinRange(date2, start, end, 'UTC'), '19:58');
    });
    it('should handle a date within the same day in CST', () => {
      const date1 = new Date(Date.UTC(2018, 0, 1, 23, 8, 57));
      const date2 = new Date(Date.UTC(2018, 0, 1, 13, 58, 31));
      const start = new Date(Date.UTC(2018, 0, 1, 21, 0, 0));
      const end = new Date(Date.UTC(2018, 0, 2, 2, 14, 0));
      assert.equal(formatDateWithinRange(date1, start, end, 'America/Chicago'), '17:08');
      assert.equal(formatDateWithinRange(date2, start, end, 'America/Chicago'), '07:58');
    });
    it('should handle a date within the same year in UTC', () => {
      const date1 = new Date(Date.UTC(2018, 0, 1, 12, 34, 7));
      const date2 = new Date(Date.UTC(2018, 6, 1, 18, 34, 7));
      const start = new Date(Date.UTC(2018, 0, 1, 12, 0, 0));
      const end = new Date(Date.UTC(2018, 0, 4, 12, 59, 59));
      assert.equal(formatDateWithinRange(date1, start, end, 'UTC'), 'Jan 1, 12:34');
      assert.equal(formatDateWithinRange(date2, start, end, 'UTC'), 'Jul 1, 18:34');
    });
    it('should handle a date within different years in UTC', () => {
      const date1 = new Date(Date.UTC(2018, 0, 1, 12, 34, 7));
      const date2 = new Date(Date.UTC(2018, 6, 1, 18, 34, 7));
      const start = new Date(Date.UTC(2018, 0, 1, 12, 0, 0));
      const end = new Date(Date.UTC(2019, 0, 1, 12, 59, 59));
      assert.equal(formatDateWithinRange(date1, start, end, 'UTC'), '2018-01-01 12:34');
      assert.equal(formatDateWithinRange(date2, start, end, 'UTC'), '2018-07-01 18:34');
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
      assert.equal(
        formatDateFriendly(date, 'UTC', { baseDate, maxPrecision: 'minute' }),
        'today, 1:34pm (UTC)',
      );
      assert.equal(
        formatDateFriendly(date, 'UTC', { baseDate, maxPrecision: 'hour' }),
        'today, 1pm (UTC)',
      );
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
      assert.equal(formatDateFriendly(date, 'UTC', { baseDate }), 'start of today (UTC)');
    });

    it('should handle noon', () => {
      const baseDate = new Date(Date.UTC(2018, 0, 1, 12, 34, 2));
      const date = new Date(Date.UTC(2018, 0, 1, 12, 0, 0));
      assert.equal(formatDateFriendly(date, 'UTC', { baseDate }), 'today, 12pm (UTC)');
    });

    describe('day boundary labels', () => {
      it('should show "start of today" for midnight (00:00:00)', () => {
        const baseDate = new Date(Date.UTC(2018, 0, 1, 12, 0, 0));
        const date = new Date(Date.UTC(2018, 0, 1, 0, 0, 0));
        assert.equal(formatDateFriendly(date, 'UTC', { baseDate }), 'start of today (UTC)');
      });

      it('should show "start of today" for 00:00:01', () => {
        const baseDate = new Date(Date.UTC(2018, 0, 1, 12, 0, 0));
        const date = new Date(Date.UTC(2018, 0, 1, 0, 0, 1));
        assert.equal(formatDateFriendly(date, 'UTC', { baseDate }), 'start of today (UTC)');
      });

      it('should show "end of today" for 23:59:59', () => {
        const baseDate = new Date(Date.UTC(2018, 0, 1, 12, 0, 0));
        const date = new Date(Date.UTC(2018, 0, 1, 23, 59, 59));
        assert.equal(formatDateFriendly(date, 'UTC', { baseDate }), 'end of today (UTC)');
      });

      it('should show "start of tomorrow"', () => {
        const baseDate = new Date(Date.UTC(2018, 0, 1, 12, 0, 0));
        const date = new Date(Date.UTC(2018, 0, 2, 0, 0, 1));
        assert.equal(formatDateFriendly(date, 'UTC', { baseDate }), 'start of tomorrow (UTC)');
      });

      it('should show "end of tomorrow"', () => {
        const baseDate = new Date(Date.UTC(2018, 0, 1, 12, 0, 0));
        const date = new Date(Date.UTC(2018, 0, 2, 23, 59, 59));
        assert.equal(formatDateFriendly(date, 'UTC', { baseDate }), 'end of tomorrow (UTC)');
      });

      it('should show "start of day" for an absolute date', () => {
        const baseDate = new Date(Date.UTC(2018, 0, 1, 12, 0, 0));
        const date = new Date(Date.UTC(2018, 3, 15, 0, 0, 0));
        assert.equal(
          formatDateFriendly(date, 'UTC', { baseDate }),
          'Sun, Apr\u00a015, start of day (UTC)',
        );
      });

      it('should show "end of day" for an absolute date', () => {
        const baseDate = new Date(Date.UTC(2018, 0, 1, 12, 0, 0));
        const date = new Date(Date.UTC(2018, 3, 15, 23, 59, 59));
        assert.equal(
          formatDateFriendly(date, 'UTC', { baseDate }),
          'Sun, Apr\u00a015, end of day (UTC)',
        );
      });

      it('should show "start of day" for a far date with year', () => {
        const baseDate = new Date(Date.UTC(2018, 0, 1, 12, 0, 0));
        const date = new Date(Date.UTC(2018, 9, 15, 0, 0, 0));
        assert.equal(
          formatDateFriendly(date, 'UTC', { baseDate }),
          'Mon, Oct\u00a015, 2018, start of day (UTC)',
        );
      });

      it('should show boundary labels without timezone', () => {
        const baseDate = new Date(Date.UTC(2018, 0, 1, 12, 0, 0));
        const date = new Date(Date.UTC(2018, 0, 1, 0, 0, 1));
        assert.equal(
          formatDateFriendly(date, 'UTC', { baseDate, includeTz: false }),
          'start of today',
        );
      });

      it('should show normal date-only output for day boundaries with dateOnly', () => {
        const baseDate = new Date(Date.UTC(2018, 0, 1, 12, 0, 0));
        const date = new Date(Date.UTC(2018, 0, 1, 0, 0, 0));
        assert.equal(formatDateFriendly(date, 'UTC', { baseDate, dateOnly: true }), 'today (UTC)');
      });

      it('should show "start of day" / "end of day" with timeOnly', () => {
        const baseDate = new Date(Date.UTC(2018, 0, 1, 12, 0, 0));
        const startDate = new Date(Date.UTC(2018, 0, 1, 0, 0, 0));
        assert.equal(
          formatDateFriendly(startDate, 'UTC', { baseDate, timeOnly: true }),
          'start of day (UTC)',
        );
        const endDate = new Date(Date.UTC(2018, 0, 1, 23, 59, 59));
        assert.equal(
          formatDateFriendly(endDate, 'UTC', { baseDate, timeOnly: true }),
          'end of day (UTC)',
        );
      });

      it('should not apply boundary labels for non-boundary times', () => {
        const baseDate = new Date(Date.UTC(2018, 0, 1, 12, 0, 0));
        const date1 = new Date(Date.UTC(2018, 0, 1, 0, 0, 2));
        assert.equal(formatDateFriendly(date1, 'UTC', { baseDate }), 'today, 12:00:02am (UTC)');
        const date2 = new Date(Date.UTC(2018, 0, 1, 23, 59, 58));
        assert.equal(formatDateFriendly(date2, 'UTC', { baseDate }), 'today, 11:59:58pm (UTC)');
      });
    });

    describe('maxPrecision option', () => {
      it('should limit to hour precision when maxPrecision is "hour"', () => {
        const baseDate = new Date(Date.UTC(2018, 0, 1, 12, 34, 17));
        const date = new Date(Date.UTC(2018, 0, 1, 15, 45, 17));
        assert.equal(
          formatDateFriendly(date, 'UTC', {
            baseDate,
            maxPrecision: 'hour',
            timeOnly: true,
            includeTz: false,
          }),
          '3pm',
        );
      });

      it('should limit to minute precision when maxPrecision is "minute"', () => {
        const baseDate = new Date(Date.UTC(2018, 0, 1, 12, 34, 17));
        const date = new Date(Date.UTC(2018, 0, 1, 15, 45, 17));
        assert.equal(
          formatDateFriendly(date, 'UTC', {
            baseDate,
            maxPrecision: 'minute',
            timeOnly: true,
            includeTz: false,
          }),
          '3:45pm',
        );
      });

      it('should show second precision when maxPrecision is "second"', () => {
        const baseDate = new Date(Date.UTC(2018, 0, 1, 12, 34, 17));
        const date = new Date(Date.UTC(2018, 0, 1, 15, 45, 17));
        assert.equal(
          formatDateFriendly(date, 'UTC', {
            baseDate,
            maxPrecision: 'second',
            timeOnly: true,
            includeTz: false,
          }),
          '3:45:17pm',
        );
      });

      describe('minPrecision option', () => {
        it('should sometimes show minutes when minPrecision is "hour"', () => {
          const baseDate = new Date(Date.UTC(2018, 0, 1, 12, 0, 0));
          const date1 = new Date(Date.UTC(2018, 0, 1, 15, 0, 0));
          assert.equal(
            formatDateFriendly(date1, 'UTC', {
              baseDate,
              minPrecision: 'hour',
              timeOnly: true,
              includeTz: false,
            }),
            '3pm',
          );
          const date2 = new Date(Date.UTC(2018, 0, 1, 15, 1, 0));
          assert.equal(
            formatDateFriendly(date2, 'UTC', {
              baseDate,
              minPrecision: 'hour',
              timeOnly: true,
              includeTz: false,
            }),
            '3:01pm',
          );
          const date3 = new Date(Date.UTC(2018, 0, 1, 15, 0, 1));
          assert.equal(
            formatDateFriendly(date3, 'UTC', {
              baseDate,
              minPrecision: 'hour',
              timeOnly: true,
              includeTz: false,
            }),
            '3:00:01pm',
          );
        });
        it('should always show minutes when minPrecision is "minute"', () => {
          const baseDate = new Date(Date.UTC(2018, 0, 1, 12, 0, 0));
          const date = new Date(Date.UTC(2018, 0, 1, 15, 0, 0));
          assert.equal(
            formatDateFriendly(date, 'UTC', {
              baseDate,
              minPrecision: 'minute',
              timeOnly: true,
              includeTz: false,
            }),
            '3:00pm',
          );
          const date2 = new Date(Date.UTC(2018, 0, 1, 15, 1, 0));
          assert.equal(
            formatDateFriendly(date2, 'UTC', {
              baseDate,
              minPrecision: 'minute',
              timeOnly: true,
              includeTz: false,
            }),
            '3:01pm',
          );
          const date3 = new Date(Date.UTC(2018, 0, 1, 15, 0, 1));
          assert.equal(
            formatDateFriendly(date3, 'UTC', {
              baseDate,
              minPrecision: 'minute',
              timeOnly: true,
              includeTz: false,
            }),
            '3:00:01pm',
          );
        });
      });

      describe('precision option combinations', () => {
        it('should work with fixed precision (min=max)', () => {
          const baseDate = new Date(Date.UTC(2018, 0, 1, 12, 0, 0));
          const date1 = new Date(Date.UTC(2018, 0, 1, 15, 0, 0));
          assert.equal(
            formatDateFriendly(date1, 'UTC', {
              baseDate,
              maxPrecision: 'hour',
              minPrecision: 'hour',
              timeOnly: true,
              includeTz: false,
            }),
            '3pm',
          );
          assert.equal(
            formatDateFriendly(date1, 'UTC', {
              baseDate,
              maxPrecision: 'minute',
              minPrecision: 'minute',
              timeOnly: true,
              includeTz: false,
            }),
            '3:00pm',
          );
          assert.equal(
            formatDateFriendly(date1, 'UTC', {
              baseDate,
              maxPrecision: 'second',
              minPrecision: 'second',
              timeOnly: true,
              includeTz: false,
            }),
            '3:00:00pm',
          );
          const date2 = new Date(Date.UTC(2018, 0, 1, 15, 30, 45));
          assert.equal(
            formatDateFriendly(date2, 'UTC', {
              baseDate,
              maxPrecision: 'hour',
              minPrecision: 'hour',
              timeOnly: true,
              includeTz: false,
            }),
            '3pm',
          );
          assert.equal(
            formatDateFriendly(date2, 'UTC', {
              baseDate,
              maxPrecision: 'minute',
              minPrecision: 'minute',
              timeOnly: true,
              includeTz: false,
            }),
            '3:30pm',
          );
          assert.equal(
            formatDateFriendly(date2, 'UTC', {
              baseDate,
              maxPrecision: 'second',
              minPrecision: 'second',
              timeOnly: true,
              includeTz: false,
            }),
            '3:30:45pm',
          );
        });
      });

      describe('precision with full date formatting', () => {
        it('should work with full date and time formatting', () => {
          const baseDate = new Date(Date.UTC(2018, 0, 1, 12, 0, 0));
          const date = new Date(Date.UTC(2018, 0, 1, 15, 45, 17));
          assert.equal(
            formatDateFriendly(date, 'UTC', { baseDate, maxPrecision: 'minute' }),
            'today, 3:45pm (UTC)',
          );
        });

        it('should work with timeFirst option', () => {
          const baseDate = new Date(Date.UTC(2018, 0, 1, 12, 0, 0));
          const date = new Date(Date.UTC(2018, 0, 1, 15, 0, 0));
          assert.equal(
            formatDateFriendly(date, 'UTC', {
              baseDate,
              minPrecision: 'minute',
              timeFirst: true,
            }),
            '3:00pm today (UTC)',
          );
        });
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

      it('should handle two different dates in CST without the timezone', () => {
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

      describe('precision options', () => {
        it('should apply maxPrecision to both start and end times', () => {
          const baseDate = new Date(Date.UTC(2018, 0, 1, 12, 0, 0));
          const start = new Date(Date.UTC(2018, 0, 1, 15, 45, 17));
          const end = new Date(Date.UTC(2018, 0, 1, 17, 30, 45));
          assert.equal(
            formatDateRangeFriendly(start, end, 'UTC', {
              baseDate,
              maxPrecision: 'minute',
              includeTz: false,
            }),
            'today, 3:45pm to 5:30pm',
          );
        });

        it('should apply minPrecision to both start and end times', () => {
          const baseDate = new Date(Date.UTC(2018, 0, 1, 12, 0, 0));
          const start = new Date(Date.UTC(2018, 0, 1, 15, 0, 0));
          const end = new Date(Date.UTC(2018, 0, 1, 17, 0, 0));
          assert.equal(
            formatDateRangeFriendly(start, end, 'UTC', {
              baseDate,
              minPrecision: 'minute',
              includeTz: false,
            }),
            'today, 3:00pm to 5:00pm',
          );
        });

        it('should handle precision options with different dates', () => {
          const baseDate = new Date(Date.UTC(2018, 0, 1, 12, 0, 0));
          const start = new Date(Date.UTC(2018, 0, 1, 15, 45, 17));
          const end = new Date(Date.UTC(2018, 0, 2, 10, 30, 45));
          assert.equal(
            formatDateRangeFriendly(start, end, 'UTC', {
              baseDate,
              maxPrecision: 'hour',
              includeTz: false,
            }),
            'today, 3pm to tomorrow, 10am',
          );
        });

        it('should handle precision options with same times', () => {
          const baseDate = new Date(Date.UTC(2018, 0, 1, 12, 0, 0));
          const start = new Date(Date.UTC(2018, 0, 1, 15, 0, 0));
          const end = new Date(Date.UTC(2018, 0, 1, 15, 0, 0));
          assert.equal(
            formatDateRangeFriendly(start, end, 'UTC', {
              baseDate,
              maxPrecision: 'second',
              minPrecision: 'second',
              includeTz: false,
            }),
            'today, 3:00:00pm',
          );
        });

        it('should work with timeFirst and precision options', () => {
          const baseDate = new Date(Date.UTC(2018, 0, 1, 12, 0, 0));
          const start = new Date(Date.UTC(2018, 0, 1, 15, 45, 17));
          const end = new Date(Date.UTC(2018, 0, 1, 17, 30, 45));
          assert.equal(
            formatDateRangeFriendly(start, end, 'UTC', {
              baseDate,
              maxPrecision: 'minute',
              timeFirst: true,
              includeTz: false,
            }),
            '3:45pm to 5:30pm today',
          );
        });
      });
    });
  });
});
