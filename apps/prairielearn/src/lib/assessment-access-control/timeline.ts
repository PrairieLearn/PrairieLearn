import { z } from 'zod';

/**
 * Runtime version of date control fields. Top-level date columns use `Date`
 * objects (they come from the database as Date). Deadline entry dates remain
 * as strings since they are stored as JSON strings in JSONB columns.
 */
export interface RuntimeDateControl {
  release?: { date: Date };
  due?: { date: Date | null; credit?: number };
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
 * date is included as a deadline with `dueCredit`. Deadlines sharing a
 * timestamp are collapsed to one entry (insertion order early → due → late wins).
 *
 * Early-deadline credits are floored at `dueCredit` so the timeline never
 * drops below the base credit before the due date. Late-deadline credits
 * are capped at `dueCredit` so the timeline never rises above the base
 * credit after the due date.
 */
export function buildDeadlines(
  dateControl: RuntimeDateControl,
  releaseDate: Date,
  dueDate: Date | null,
): Deadline[] {
  const dueCredit = dateControl.due?.credit ?? 100;
  const deadlines: Deadline[] = [];

  if (dateControl.earlyDeadlines) {
    for (const entry of dateControl.earlyDeadlines) {
      const entryDate = new Date(entry.date);
      if (entryDate <= releaseDate) continue;
      if (dueDate && entryDate > dueDate) continue;
      deadlines.push({ date: entryDate, credit: Math.max(entry.credit, dueCredit) });
    }
  }

  if (dueDate) {
    deadlines.push({ date: dueDate, credit: dueCredit });
  }

  if (dateControl.lateDeadlines) {
    for (const entry of dateControl.lateDeadlines) {
      const entryDate = new Date(entry.date);
      if (entryDate <= releaseDate) continue;
      if (dueDate && entryDate < dueDate) continue;
      deadlines.push({ date: entryDate, credit: Math.min(entry.credit, dueCredit) });
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
  const dueDate = dateControl.due?.date ?? null;
  const dueCredit = dateControl.due?.credit ?? 100;
  // `due` configured with `date: null` means the due-date credit applies
  // indefinitely after release and shadows any afterLastDeadline. Mirrors
  // the special-case branches in `computeCredit`.
  const dueIsIndefinite = dateControl.due !== undefined && dueDate === null;

  if (dueDate && dueDate <= releaseDate) return [];

  const deadlines = buildDeadlines(dateControl, releaseDate, dueDate);

  if (deadlines.length === 0) {
    return [
      {
        credit: dueIsIndefinite ? dueCredit : 100,
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

  if (dueIsIndefinite) {
    segments.push({
      credit: dueCredit,
      startDate: segmentStart,
      endDate: null,
      current: date >= segmentStart,
      submittable: true,
    });
  } else {
    segments.push({
      credit: dateControl.afterLastDeadline?.credit ?? 0,
      startDate: segmentStart,
      endDate: null,
      current: date >= segmentStart,
      submittable: dateControl.afterLastDeadline?.allowSubmissions === true,
    });
  }

  return segments;
}
