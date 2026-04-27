import { z } from 'zod';

/**
 * Runtime version of date control fields. Top-level date columns use `Date`
 * objects (they come from the database as Date). Deadline entry dates remain
 * as strings since they are stored as JSON strings in JSONB columns.
 */
export interface RuntimeDateControl {
  release?: { date: Date };
  dueDate?: Date | null;
  earlyDeadlines?: { date: string; credit: number }[] | null;
  lateDeadlines?: { date: string; credit: number }[] | null;
  afterLastDeadline?: { allowSubmissions?: boolean; credit?: number | null };
  durationMinutes?: number | null;
  password?: string | null;
}

export const AccessTimelineEntrySchema = z.object({
  credit: z.number(),
  startDate: z.date().nullable(),
  endDate: z.date().nullable(),
  /** True iff `date` falls within this segment — at most one entry per timeline. */
  current: z.boolean(),
  /** True iff a student can submit during this segment. Used by the student popover to hide rows that would otherwise read as "submit for 0 credit". */
  submittable: z.boolean(),
});
export type AccessTimelineEntry = z.infer<typeof AccessTimelineEntrySchema>;

interface Deadline {
  date: Date;
  credit: number;
}

/**
 * Each returned entry is a point in time where credit changes: the credit
 * applies when the submission time is strictly less than `date`. The due
 * date is included as a 100%-credit deadline. Deadlines sharing a timestamp
 * are collapsed to one entry (insertion order early → due → late wins).
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
 * Builds an access timeline for display. Each entry is a contiguous period
 * [startDate, endDate) with a credit value. A before-release entry
 * (startDate: null) is prepended when `date` precedes the release date, and
 * an after-last-deadline entry (endDate: null) is always appended.
 */
export function buildAccessTimeline(
  dateControl: RuntimeDateControl | undefined,
  date: Date,
): AccessTimelineEntry[] {
  if (!dateControl?.release) return [];

  const releaseDate = dateControl.release.date;
  const dueDate = dateControl.dueDate ?? null;

  if (dueDate && dueDate <= releaseDate) return [];

  const deadlines = buildDeadlines(dateControl, releaseDate, dueDate);

  if (deadlines.length === 0) {
    return [
      {
        credit: 100,
        startDate: releaseDate,
        endDate: null,
        current: date >= releaseDate,
        submittable: true,
      },
    ];
  }

  const segments: AccessTimelineEntry[] = [];

  if (date < releaseDate) {
    segments.push({
      credit: 0,
      startDate: null,
      endDate: releaseDate,
      current: true,
      submittable: false,
    });
  }

  let segmentStart = releaseDate;
  for (const deadline of deadlines) {
    segments.push({
      credit: deadline.credit,
      startDate: segmentStart,
      endDate: deadline.date,
      current: date >= segmentStart && date < deadline.date,
      submittable: true,
    });
    segmentStart = deadline.date;
  }

  segments.push({
    credit: dateControl.afterLastDeadline?.credit ?? 0,
    startDate: segmentStart,
    endDate: null,
    current: date >= segmentStart,
    submittable: dateControl.afterLastDeadline?.allowSubmissions === true,
  });

  return segments;
}
