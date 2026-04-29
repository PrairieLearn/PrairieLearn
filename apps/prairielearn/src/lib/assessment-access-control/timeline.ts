import { z } from 'zod';

/**
 * In-memory representation of date control fields. Mirrors the JSON schema
 * shape with strings for top-level date fields swapped to `Date` (they come
 * from the database as Date). Deadline entry dates stay as strings since
 * they're stored as JSON strings inside JSONB columns.
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
function buildDeadlines(
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
      // Drop (don't clamp) any late deadline that falls before the effective
      // due date. This is intentional: an override that pushes the due date
      // later can leave a previously-valid late deadline sitting before the
      // new due, and we treat that as the override having superseded it
      // rather than silently shifting the deadline forward.
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

interface AccessSegment {
  /** `null` denotes the pre-release segment. */
  startDate: Date | null;
  /** `null` denotes the open-ended segment after the last deadline. */
  endDate: Date | null;
  credit: number;
  /** Whether submissions are allowed during this segment. */
  submittable: boolean;
}

/**
 * Builds a contiguous, ordered set of access segments covering the entire
 * timeline. Returns `[]` when the date control has no usable access path
 * (no release configured, or due date on/before release date). Otherwise:
 *
 * - Index 0 is always the pre-release segment `[null, releaseDate)`.
 * - Middle segments are bounded by adjacent deadlines.
 * - The final segment is `[lastDeadline, null)`. Its credit/submittable depend
 *   on `afterLastDeadline`, except when `due: { date: null }` is set —
 *   that "indefinite due" case shadows `afterLastDeadline` and applies
 *   `dueCredit` (default 100%) forever, with submissions allowed.
 */
function buildSegments(dateControl: RuntimeDateControl | undefined): AccessSegment[] {
  if (!dateControl?.release) return [];

  const releaseDate = dateControl.release.date;
  const dueDate = dateControl.due?.date ?? null;
  const dueCredit = dateControl.due?.credit ?? 100;
  const dueIsIndefinite = dateControl.due !== undefined && dueDate === null;

  if (dueDate && dueDate <= releaseDate) return [];

  const deadlines = buildDeadlines(dateControl, releaseDate, dueDate);
  const segments: AccessSegment[] = [
    { startDate: null, endDate: releaseDate, credit: 0, submittable: false },
  ];

  let segStart = releaseDate;
  for (const deadline of deadlines) {
    segments.push({
      startDate: segStart,
      endDate: deadline.date,
      credit: deadline.credit,
      submittable: true,
    });
    segStart = deadline.date;
  }

  if (dueIsIndefinite) {
    segments.push({ startDate: segStart, endDate: null, credit: dueCredit, submittable: true });
  } else if (deadlines.length === 0) {
    segments.push({ startDate: segStart, endDate: null, credit: 100, submittable: true });
  } else {
    segments.push({
      startDate: segStart,
      endDate: null,
      credit: dateControl.afterLastDeadline?.credit ?? 0,
      submittable: dateControl.afterLastDeadline?.allowSubmissions === true,
    });
  }

  return segments;
}

/**
 * Builds the timeline of credit segments for `dateControl`, tagging the
 * segment that contains `date` with `current: true`. The pre-release segment
 * is always emitted; the student popover filters non-submittable entries
 * client-side. Returns `[]` when the date control has no usable access path.
 */
export function buildAccessTimeline(
  dateControl: RuntimeDateControl | undefined,
  date: Date,
): AccessTimelineEntry[] {
  return buildSegments(dateControl).map((s) => ({
    credit: s.credit,
    startDate: s.startDate,
    endDate: s.endDate,
    current:
      (s.startDate === null || date >= s.startDate) && (s.endDate === null || date < s.endDate),
    submittable: s.submittable,
  }));
}

