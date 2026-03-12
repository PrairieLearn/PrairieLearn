import type { DeadlineEntry } from '../types.js';

export function getUserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

interface DateRange {
  start: Date | null;
  end: Date;
}

export function getEarlyDeadlineRange(
  index: number,
  deadlines: DeadlineEntry[],
  releaseDate: string | null | undefined,
): DateRange | null {
  const currentDeadline = deadlines[index];
  if (!currentDeadline.date) return null;

  const endDate = new Date(currentDeadline.date);
  let startDate: Date | null = null;

  if (index === 0) {
    if (releaseDate) {
      startDate = new Date(releaseDate);
    }
  } else {
    const previousDeadline = deadlines[index - 1];
    if (previousDeadline.date) {
      startDate = new Date(previousDeadline.date);
    }
  }

  return { start: startDate, end: endDate };
}

export function getLateDeadlineRange(
  index: number,
  deadlines: DeadlineEntry[],
  dueDate: string | null | undefined,
): DateRange | null {
  const currentDeadline = deadlines[index];
  if (!currentDeadline.date) return null;

  const endDate = new Date(currentDeadline.date);
  let startDate: Date | null = null;

  if (index === 0) {
    if (dueDate) {
      startDate = new Date(dueDate);
    }
  } else {
    const previousDeadline = deadlines[index - 1];
    if (previousDeadline.date) {
      startDate = new Date(previousDeadline.date);
    }
  }

  return { start: startDate, end: endDate };
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
