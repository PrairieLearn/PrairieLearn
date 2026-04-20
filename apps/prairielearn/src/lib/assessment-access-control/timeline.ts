/**
 * Runtime version of date control fields. Top-level date columns use `Date`
 * objects (they come from the database as Date). Deadline entry dates remain
 * as strings since they are stored as JSON strings in JSONB columns.
 */
export interface RuntimeDateControl {
  releaseDate?: Date | null;
  dueDate?: Date | null;
  earlyDeadlines?: { date: string; credit: number }[] | null;
  lateDeadlines?: { date: string; credit: number }[] | null;
  afterLastDeadline?: { allowSubmissions?: boolean; credit?: number | null };
  durationMinutes?: number | null;
  password?: string | null;
}

export interface AccessTimelineEntry {
  credit: number;
  startDate: Date | null;
  endDate: Date | null;
  active: boolean;
}

interface Deadline {
  date: Date;
  credit: number;
}

/**
 * Collects and sorts a rule's deadlines into a single timeline.
 *
 * Each returned entry represents a point in time where the credit value
 * changes: the credit applies when the submission time is strictly less
 * than `date`. The due date itself is included as a 100%-credit deadline.
 *
 * Entries on/before the release date and early/late entries strictly past
 * their respective side of the due date are filtered out. Deadlines that
 * share a timestamp are collapsed to a single entry (insertion order
 * early → due → late decides which credit wins).
 */
export function buildDeadlines(
  dateControl: RuntimeDateControl,
  releaseDate: Date,
  dueDate: Date | null,
): Deadline[] {
  const deadlines: Deadline[] = [];

  if (dateControl.earlyDeadlines) {
    for (const entry of dateControl.earlyDeadlines) {
      const entryDate = new Date(entry.date);
      if (entryDate <= releaseDate) continue;
      if (dueDate && entryDate > dueDate) continue;
      deadlines.push({ date: entryDate, credit: entry.credit });
    }
  }

  if (dueDate) {
    deadlines.push({ date: dueDate, credit: 100 });
  }

  if (dateControl.lateDeadlines) {
    for (const entry of dateControl.lateDeadlines) {
      const entryDate = new Date(entry.date);
      if (entryDate <= releaseDate) continue;
      if (dueDate && entryDate < dueDate) continue;
      deadlines.push({ date: entryDate, credit: entry.credit });
    }
  }

  deadlines.sort((a, b) => a.date.getTime() - b.date.getTime());

  // Collapse deadlines that land on the same timestamp. Earlier entries win
  // (insertion order: early, due, late) because only the first entry's credit
  // is reachable before that timestamp.
  const deduped: Deadline[] = [];
  let lastTime: number | null = null;
  for (const deadline of deadlines) {
    const time = deadline.date.getTime();
    if (time === lastTime) continue;
    deduped.push(deadline);
    lastTime = time;
  }
  return deduped;
}

/**
 * Builds an access timeline from dateControl for display purposes.
 * Each entry is a contiguous period [startDate, endDate) with a credit value.
 *
 * - A before-release entry (startDate: null) is included when the current
 *   date is before the release date.
 * - An after-last-deadline entry (endDate: null) is always appended.
 */
export function buildAccessTimeline(
  dateControl: RuntimeDateControl | undefined,
  date: Date,
): AccessTimelineEntry[] {
  if (!dateControl?.releaseDate) return [];

  const releaseDate = dateControl.releaseDate;
  const dueDate = dateControl.dueDate ?? null;

  if (dueDate && dueDate <= releaseDate) return [];

  const deadlines = buildDeadlines(dateControl, releaseDate, dueDate);

  // No deadlines = available forever with full credit; single open-ended segment.
  if (deadlines.length === 0) {
    return [{ credit: 100, startDate: releaseDate, endDate: null, active: date >= releaseDate }];
  }

  const segments: AccessTimelineEntry[] = [];

  // Before-release entry when the current date precedes the release date.
  if (date < releaseDate) {
    segments.push({
      credit: 0,
      startDate: null,
      endDate: releaseDate,
      active: true,
    });
  }

  // Credit segments derived from deadlines.
  let segmentStart = releaseDate;
  for (const deadline of deadlines) {
    segments.push({
      credit: deadline.credit,
      startDate: segmentStart,
      endDate: deadline.date,
      active: date >= segmentStart && date < deadline.date,
    });
    segmentStart = deadline.date;
  }

  // After-last-deadline entry is always shown.
  const afterCredit = dateControl.afterLastDeadline?.credit ?? 0;
  segments.push({
    credit: afterCredit,
    startDate: segmentStart,
    endDate: null,
    active: date >= segmentStart,
  });

  return segments;
}
