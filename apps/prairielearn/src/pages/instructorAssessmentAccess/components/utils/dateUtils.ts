import type { DeadlineEntry, OverridableField } from '../types.js';

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
  releaseDate: OverridableField<string>,
): DateRange | null {
  const currentDeadline = deadlines[index];
  if (!currentDeadline.date) return null;

  const endDate = new Date(currentDeadline.date);
  let startDate: Date | null = null;

  if (index === 0) {
    if (releaseDate.isEnabled && releaseDate.value) {
      startDate = new Date(releaseDate.value);
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
  dueDate: OverridableField<string>,
): DateRange | null {
  const currentDeadline = deadlines[index];
  if (!currentDeadline.date) return null;

  const endDate = new Date(currentDeadline.date);
  let startDate: Date | null = null;

  if (index === 0) {
    if (dueDate.isEnabled && dueDate.value) {
      startDate = new Date(dueDate.value);
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
  lateDeadlines: OverridableField<DeadlineEntry[]>,
  dueDate: OverridableField<string>,
): Date | null {
  if (lateDeadlines.isEnabled && lateDeadlines.value.length > 0) {
    const validLateDeadlines = lateDeadlines.value.filter((d) => d.date);
    if (validLateDeadlines.length > 0) {
      const sorted = [...validLateDeadlines].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      );
      return new Date(sorted[0].date);
    }
  }

  if (dueDate.isEnabled && dueDate.value) {
    return new Date(dueDate.value);
  }

  return null;
}

export function getLatestEarlyDeadlineDate(
  earlyDeadlines: OverridableField<DeadlineEntry[]>,
): Date | null {
  if (!earlyDeadlines.isEnabled || earlyDeadlines.value.length === 0) {
    return null;
  }

  const validDeadlines = earlyDeadlines.value.filter((d) => d.date);
  if (validDeadlines.length === 0) {
    return null;
  }

  const sorted = [...validDeadlines].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
  return new Date(sorted[0].date);
}
