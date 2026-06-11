import { Temporal } from '@js-temporal/polyfill';

/**
 * Calendar math for the assessment calendar view. All day bucketing happens in
 * the course instance's display timezone so a late-night due date lands on the
 * correct day for every viewer regardless of browser timezone.
 */

export interface CalendarSpanInput<T> {
  item: T;
  start: Temporal.PlainDate;
  /** Inclusive end day; null for an open-ended span. */
  end: Temporal.PlainDate | null;
  /** Windows occupy lanes before chips so multi-day bars stack on top. */
  kind: 'window' | 'chip';
}

export interface PositionedSpan<T> {
  item: T;
  kind: 'window' | 'chip';
  /** 0-based lane index within the week. */
  lane: number;
  /** 1-based grid columns; endCol is inclusive. */
  startCol: number;
  endCol: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
}

/** The calendar day containing `date` in the given timezone. */
export function dateToPlainDate(date: Date, timeZone: string): Temporal.PlainDate {
  return Temporal.Instant.fromEpochMilliseconds(date.getTime())
    .toZonedDateTimeISO(timeZone)
    .toPlainDate();
}

/** Sunday-start weeks covering the month, each exactly 7 days. */
export function weeksOfMonth(month: Temporal.PlainYearMonth): Temporal.PlainDate[][] {
  const first = month.toPlainDate({ day: 1 });
  const last = month.toPlainDate({ day: month.daysInMonth });
  // dayOfWeek is ISO (1 = Monday … 7 = Sunday), so `dayOfWeek % 7` is the
  // offset from the preceding Sunday.
  let day = first.subtract({ days: first.dayOfWeek % 7 });
  const weeks: Temporal.PlainDate[][] = [];
  while (Temporal.PlainDate.compare(day, last) <= 0) {
    const week: Temporal.PlainDate[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(day);
      day = day.add({ days: 1 });
    }
    weeks.push(week);
  }
  return weeks;
}

/**
 * Clips spans to one week and packs them into lanes: each span gets the lowest
 * lane where it doesn't overlap a previously placed span. Windows are placed
 * before chips, then by start column, then wider spans first, so multi-day
 * bars stack consistently across weeks.
 */
export function computeWeekLanes<T>(
  spans: CalendarSpanInput<T>[],
  week: Temporal.PlainDate[],
): PositionedSpan<T>[] {
  const weekStart = week[0];
  const weekEnd = week[week.length - 1];

  const clipped = spans.flatMap((span): Omit<PositionedSpan<T>, 'lane'>[] => {
    if (Temporal.PlainDate.compare(span.start, weekEnd) > 0) return [];
    if (span.end !== null && Temporal.PlainDate.compare(span.end, weekStart) < 0) return [];

    const startOffset = weekStart.until(span.start).total('days');
    const endOffset = span.end === null ? Infinity : weekStart.until(span.end).total('days');
    return [
      {
        item: span.item,
        kind: span.kind,
        startCol: Math.max(1, startOffset + 1),
        endCol: Math.min(7, endOffset + 1),
        continuesBefore: startOffset < 0,
        continuesAfter: endOffset > 6,
      },
    ];
  });

  clipped.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'window' ? -1 : 1;
    if (a.startCol !== b.startCol) return a.startCol - b.startCol;
    return b.endCol - b.startCol - (a.endCol - a.startCol);
  });

  const laneEnds: [number, number][][] = [];
  return clipped.map((span) => {
    let lane = laneEnds.findIndex(
      (occupied) => !occupied.some(([s, e]) => span.startCol <= e && span.endCol >= s),
    );
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push([]);
    }
    laneEnds[lane].push([span.startCol, span.endCol]);
    return { ...span, lane };
  });
}

/** Clamps `month` to [min, max]; either bound may be null (unbounded). */
export function clampMonth(
  month: Temporal.PlainYearMonth,
  min: Temporal.PlainYearMonth | null,
  max: Temporal.PlainYearMonth | null,
): Temporal.PlainYearMonth {
  if (min !== null && Temporal.PlainYearMonth.compare(month, min) < 0) return min;
  if (max !== null && Temporal.PlainYearMonth.compare(month, max) > 0) return max;
  return month;
}
