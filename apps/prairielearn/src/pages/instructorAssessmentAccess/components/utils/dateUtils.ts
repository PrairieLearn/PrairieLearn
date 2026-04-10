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

export function getLatestDeadlineEntry(deadlines: DeadlineEntry[]): Temporal.PlainDateTime | null {
  let latest = '';
  for (const d of deadlines) {
    if (d.date && d.date > latest) latest = d.date;
  }
  return latest ? Temporal.PlainDateTime.from(latest) : null;
}

export function getLastDeadlineDate(
  lateDeadlines: DeadlineEntry[] | undefined,
  dueDate: string | null | undefined,
): Temporal.PlainDateTime | null {
  if (lateDeadlines) {
    const result = getLatestDeadlineEntry(lateDeadlines);
    if (result) return result;
  }

  if (dueDate) {
    return Temporal.PlainDateTime.from(dueDate);
  }

  return null;
}
