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

export function getUserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function getLastDeadlineDate(
  lateDeadlines: DeadlineEntry[] | undefined,
  dueDate: string | null | undefined,
): Date | null {
  if (lateDeadlines && lateDeadlines.length > 0) {
    const validLateDeadlines = lateDeadlines.filter((d) => d.date);
    if (validLateDeadlines.length > 0) {
      const sorted = [...validLateDeadlines].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      );
      return new Date(sorted[0].date);
    }
  }

  if (dueDate) {
    return new Date(dueDate);
  }

  return null;
}

export function getLatestEarlyDeadlineDate(earlyDeadlines: DeadlineEntry[]): Date | null {
  if (earlyDeadlines.length === 0) {
    return null;
  }

  const validDeadlines = earlyDeadlines.filter((d) => d.date);
  if (validDeadlines.length === 0) {
    return null;
  }

  const sorted = [...validDeadlines].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
  return new Date(sorted[0].date);
}
