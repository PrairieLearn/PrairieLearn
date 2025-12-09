import type { DeadlineEntry, OverridableField } from '../types.js';

/**
 * Get the user's local browser timezone
 */
export function getUserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

interface DateRange {
  start: Date | null;
  end: Date;
}

/**
 * Calculate the active time range for an early deadline entry.
 * Returns the start and end dates for when this credit level is active.
 */
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
    // First early deadline starts from release date
    if (releaseDate.isEnabled && releaseDate.value) {
      startDate = new Date(releaseDate.value);
    }
  } else {
    // Subsequent deadlines start from previous deadline
    const previousDeadline = deadlines[index - 1];
    if (previousDeadline.date) {
      startDate = new Date(previousDeadline.date);
    }
  }

  return { start: startDate, end: endDate };
}

/**
 * Calculate the active time range for a late deadline entry.
 * Returns the start and end dates for when this credit level is active.
 */
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
    // First late deadline starts from due date
    if (dueDate.isEnabled && dueDate.value) {
      startDate = new Date(dueDate.value);
    }
  } else {
    // Subsequent deadlines start from previous deadline
    const previousDeadline = deadlines[index - 1];
    if (previousDeadline.date) {
      startDate = new Date(previousDeadline.date);
    }
  }

  return { start: startDate, end: endDate };
}

/**
 * Get the latest deadline date from either late deadlines or due date.
 * Used for displaying "After Last Deadline" text.
 */
export function getLastDeadlineDate(
  lateDeadlines: OverridableField<DeadlineEntry[]>,
  dueDate: OverridableField<string>,
): Date | null {
  // Check late deadlines first
  if (lateDeadlines.isEnabled && lateDeadlines.value.length > 0) {
    const validLateDeadlines = lateDeadlines.value.filter((d) => d.date);
    if (validLateDeadlines.length > 0) {
      const sorted = [...validLateDeadlines].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      );
      return new Date(sorted[0].date);
    }
  }

  // Fall back to due date
  if (dueDate.isEnabled && dueDate.value) {
    return new Date(dueDate.value);
  }

  return null;
}

/**
 * Get the latest early deadline date.
 * Used for calculating due date credit range.
 */
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
