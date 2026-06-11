import { Temporal } from '@js-temporal/polyfill';
import { describe, expect, it } from 'vitest';

import {
  type CalendarSpanInput,
  clampMonth,
  computeWeekLanes,
  dateToPlainDate,
  exclusiveEndToPlainDate,
  weeksOfMonth,
} from './assessment-calendar.js';

const day = (s: string) => Temporal.PlainDate.from(s);
const month = (s: string) => Temporal.PlainYearMonth.from(s);

describe('dateToPlainDate', () => {
  it('buckets instants by the display timezone, not UTC', () => {
    // 23:59 Chicago on March 20 is 04:59 UTC on March 21.
    const date = new Date('2026-03-21T04:59:00Z');
    expect(dateToPlainDate(date, 'America/Chicago').toString()).toBe('2026-03-20');
    expect(dateToPlainDate(date, 'UTC').toString()).toBe('2026-03-21');
  });

  it('handles DST transitions', () => {
    // The US spring-forward gap (2026-03-08 02:00 Chicago) does not shift days.
    const date = new Date('2026-03-08T08:30:00Z'); // 02:30 CST → 03:30 CDT
    expect(dateToPlainDate(date, 'America/Chicago').toString()).toBe('2026-03-08');
  });
});

describe('exclusiveEndToPlainDate', () => {
  it('places an exact-midnight deadline on the preceding day', () => {
    // Midnight Mar 8 Chicago: submissions end at the end of Mar 7.
    const date = new Date('2026-03-08T06:00:00Z'); // 00:00:00 CST
    expect(exclusiveEndToPlainDate(date, 'America/Chicago').toString()).toBe('2026-03-07');
  });

  it('keeps a same-day deadline on its day', () => {
    const date = new Date('2026-03-21T04:59:00Z'); // 23:59 Mar 20 Chicago
    expect(exclusiveEndToPlainDate(date, 'America/Chicago').toString()).toBe('2026-03-20');
  });
});

describe('weeksOfMonth', () => {
  it('produces Sunday-start weeks covering the month', () => {
    // March 2026 starts on a Sunday and has exactly 5 weeks.
    const weeks = weeksOfMonth(month('2026-03'));
    expect(weeks).toHaveLength(5);
    expect(weeks[0][0].toString()).toBe('2026-03-01');
    expect(weeks[4][6].toString()).toBe('2026-04-04');
    for (const week of weeks) expect(week).toHaveLength(7);
  });

  it('includes leading days from the previous month', () => {
    // April 2026 starts on a Wednesday.
    const weeks = weeksOfMonth(month('2026-04'));
    expect(weeks[0][0].toString()).toBe('2026-03-29');
    expect(weeks[0][3].toString()).toBe('2026-04-01');
  });
});

describe('computeWeekLanes', () => {
  const week = weeksOfMonth(month('2026-03'))[0]; // Mar 1–7

  it('clips spans to the week and flags continuation', () => {
    const spans: CalendarSpanInput<string>[] = [
      { item: 'a', start: day('2026-02-23'), end: day('2026-03-06'), kind: 'window' },
    ];
    expect(computeWeekLanes(spans, week)).toEqual([
      {
        item: 'a',
        kind: 'window',
        lane: 0,
        startCol: 1,
        endCol: 6,
        continuesBefore: true,
        continuesAfter: false,
      },
    ]);
  });

  it('drops spans outside the week', () => {
    const spans: CalendarSpanInput<string>[] = [
      { item: 'past', start: day('2026-02-01'), end: day('2026-02-10'), kind: 'window' },
      { item: 'future', start: day('2026-03-09'), end: day('2026-03-11'), kind: 'window' },
    ];
    expect(computeWeekLanes(spans, week)).toEqual([]);
  });

  it('treats open-ended spans as continuing past the week', () => {
    const spans: CalendarSpanInput<string>[] = [
      { item: 'a', start: day('2026-03-03'), end: null, kind: 'window' },
    ];
    expect(computeWeekLanes(spans, week)).toMatchObject([
      { startCol: 3, endCol: 7, continuesBefore: false, continuesAfter: true },
    ]);
  });

  it('packs overlapping spans into separate lanes and reuses free lanes', () => {
    const spans: CalendarSpanInput<string>[] = [
      { item: 'a', start: day('2026-03-01'), end: day('2026-03-04'), kind: 'window' },
      { item: 'b', start: day('2026-03-03'), end: day('2026-03-07'), kind: 'window' },
      { item: 'c', start: day('2026-03-05'), end: day('2026-03-06'), kind: 'window' },
    ];
    const result = computeWeekLanes(spans, week);
    expect(result.find((s) => s.item === 'a')?.lane).toBe(0);
    expect(result.find((s) => s.item === 'b')?.lane).toBe(1);
    // 'c' fits back into lane 0 after 'a' ends.
    expect(result.find((s) => s.item === 'c')?.lane).toBe(0);
  });

  it('places window bars in lower lanes than chips', () => {
    const spans: CalendarSpanInput<string>[] = [
      { item: 'chip', start: day('2026-03-02'), end: day('2026-03-02'), kind: 'chip' },
      { item: 'bar', start: day('2026-03-01'), end: day('2026-03-07'), kind: 'window' },
    ];
    const result = computeWeekLanes(spans, week);
    expect(result.find((s) => s.item === 'bar')?.lane).toBe(0);
    expect(result.find((s) => s.item === 'chip')?.lane).toBe(1);
  });
});

describe('clampMonth', () => {
  it('clamps to bounds and passes through in range', () => {
    expect(clampMonth(month('2026-01'), month('2026-02'), month('2026-05')).toString()).toBe(
      '2026-02',
    );
    expect(clampMonth(month('2026-08'), month('2026-02'), month('2026-05')).toString()).toBe(
      '2026-05',
    );
    expect(clampMonth(month('2026-03'), month('2026-02'), month('2026-05')).toString()).toBe(
      '2026-03',
    );
    expect(clampMonth(month('2026-03'), null, null).toString()).toBe('2026-03');
  });
});
