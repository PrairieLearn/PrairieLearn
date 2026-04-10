import { Temporal } from '@js-temporal/polyfill';

import type { DeadlineEntry } from '../types.js';

// Dates are offset by 1 second from midnight boundaries (00:00:01 / 23:59:59)
// to avoid ambiguity when a date falls exactly on a day boundary.

export function todayDate(displayTimezone: string): Temporal.PlainDate {
  return Temporal.Now.plainDateISO(displayTimezone);
}

export function tomorrowDate(displayTimezone: string): Temporal.PlainDate {
  return Temporal.Now.plainDateISO(displayTimezone).add({ days: 1 });
}

export function startOfDayDatetime(date: Temporal.PlainDate): string {
  return date
    .toPlainDateTime({ hour: 0, minute: 0, second: 1 })
    .toString({ smallestUnit: 'second' });
}

export function endOfDayDatetime(date: Temporal.PlainDate): string {
  return date
    .toPlainDateTime({ hour: 23, minute: 59, second: 59 })
    .toString({ smallestUnit: 'second' });
}

interface DateRange {
  start: Temporal.PlainDateTime | null;
  end: Temporal.PlainDateTime;
}

export function getDeadlineRange(
  index: number,
  deadlines: DeadlineEntry[],
  anchorDate: string | null | undefined,
): DateRange | null {
  const currentDeadline = deadlines[index];
  if (!currentDeadline.date) return null;

  const end = Temporal.PlainDateTime.from(currentDeadline.date);
  let start: Temporal.PlainDateTime | null = null;

  if (index === 0) {
    if (anchorDate) {
      start = Temporal.PlainDateTime.from(anchorDate);
    }
  } else {
    const previousDeadline = deadlines[index - 1];
    if (previousDeadline.date) {
      start = Temporal.PlainDateTime.from(previousDeadline.date);
    }
  }

  return { start, end };
}

export function getLastDeadlineDate(
  lateDeadlines: DeadlineEntry[] | undefined,
  dueDate: string | null | undefined,
): Temporal.PlainDateTime | null {
  if (lateDeadlines && lateDeadlines.length > 0) {
    const validLateDeadlines = lateDeadlines.filter((d) => d.date);
    if (validLateDeadlines.length > 0) {
      const sorted = [...validLateDeadlines].sort((a, b) => (a.date < b.date ? 1 : -1));
      return Temporal.PlainDateTime.from(sorted[0].date);
    }
  }

  if (dueDate) {
    return Temporal.PlainDateTime.from(dueDate);
  }

  return null;
}

export function getLatestEarlyDeadlineDate(
  earlyDeadlines: DeadlineEntry[],
): Temporal.PlainDateTime | null {
  if (earlyDeadlines.length === 0) {
    return null;
  }

  const validDeadlines = earlyDeadlines.filter((d) => d.date);
  if (validDeadlines.length === 0) {
    return null;
  }

  const sorted = [...validDeadlines].sort((a, b) => (a.date < b.date ? 1 : -1));
  return Temporal.PlainDateTime.from(sorted[0].date);
}
