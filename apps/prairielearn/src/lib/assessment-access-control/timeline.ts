import { z } from 'zod';

/**
 * In-memory representation of date control fields. Top-level date fields are
 * `Date`; deadline entry dates stay as strings since they're stored as JSON
 * strings inside JSONB columns.
 */
export interface RuntimeDateControl {
  release?: { date: Date };
  due?: { date: Date | null; credit?: number };
  earlyDeadlines?: { date: string; credit: number }[] | null;
  lateDeadlines?: { date: string; credit: number }[] | null;
  afterLastDeadline?: { allowSubmissions?: boolean; credit?: number | null } | null;
  durationMinutes?: number | null;
  password?: string | null;
}

/**
 * Discriminator for which structural slot a segment fills:
 * - `beforeRelease`: pre-release segment (always entries[0])
 * - `deadline`: a credit window ending at a deadline; credit applies to submissions strictly before `endDate`
 * - `afterLastDeadline`: trailing segment when at least one deadline exists; submission permission comes from `afterLastDeadline`
 * - `noDeadline`: trailing segment when no deadline bounds it — either `due: { date: null }` or no deadlines at all. Submissions remain open at `dueCredit` (defaulting to 100%).
 */
const AccessTimelineEntryKindSchema = z.enum([
  'beforeRelease',
  'deadline',
  'afterLastDeadline',
  'noDeadline',
]);

export const AccessTimelineEntrySchema = z.object({
  kind: AccessTimelineEntryKindSchema,
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
 * Each returned entry is a point where credit changes: the credit applies for
 * submissions strictly before `date`. The due date is included as a deadline
 * with `dueCredit`. Deadlines sharing a timestamp are collapsed to one
 * (insertion order early → due → late wins).
 *
 * Validation normally rejects deadline credits that would cross the due-date
 * credit on the wrong side of the due date. The floor/cap below keeps each
 * deadline's credit on the correct side of `dueCredit` when stacked overrides
 * still produce a crossed shape; `buildAccessTimeline` then enforces a
 * non-increasing credit timeline across all segments as a final backstop.
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

/**
 * Builds a contiguous, ordered timeline of credit segments, tagging the
 * segment containing `date` with `current: true`. Returns `[]` when the date
 * control has no usable access path (no release configured, or due date
 * on/before release date). Otherwise:
 *
 * - Index 0 is always the pre-release segment `[null, releaseDate)`.
 * - Middle segments are bounded by adjacent deadlines.
 * - The final segment is `[lastDeadline, null)`. Its credit/submittable depend
 *   on `afterLastDeadline`, except when `due: { date: null }` is set —
 *   that "indefinite due" case shadows `afterLastDeadline` and applies
 *   `dueCredit` (default 100%) forever, with submissions allowed.
 */
export function buildAccessTimeline(
  dateControl: RuntimeDateControl | undefined,
  date: Date,
): AccessTimelineEntry[] {
  if (!dateControl?.release) return [];

  const releaseDate = dateControl.release.date;
  const dueDate = dateControl.due?.date ?? null;
  const dueCredit = dateControl.due?.credit ?? 100;
  const dueIsIndefinite = dateControl.due !== undefined && dueDate === null;

  if (dueDate && dueDate <= releaseDate) return [];

  const isCurrent = (startDate: Date | null, endDate: Date | null) =>
    (startDate === null || date >= startDate) && (endDate === null || date < endDate);

  const deadlines = buildDeadlines(dateControl, releaseDate, dueDate);
  const entries: AccessTimelineEntry[] = [
    {
      kind: 'beforeRelease',
      startDate: null,
      endDate: releaseDate,
      credit: 0,
      current: isCurrent(null, releaseDate),
      submittable: false,
    },
  ];

  let segStart = releaseDate;
  for (const deadline of deadlines) {
    entries.push({
      kind: 'deadline',
      startDate: segStart,
      endDate: deadline.date,
      credit: deadline.credit,
      current: isCurrent(segStart, deadline.date),
      submittable: true,
    });
    segStart = deadline.date;
  }

  if (dueIsIndefinite || deadlines.length === 0) {
    entries.push({
      kind: 'noDeadline',
      startDate: segStart,
      endDate: null,
      credit: dueIsIndefinite ? dueCredit : 100,
      current: isCurrent(segStart, null),
      submittable: true,
    });
  } else {
    // After the final deadline, the assessment is complete and remains
    // accessible for whatever afterComplete permits. `afterLastDeadline`
    // controls only whether submissions continue and at what credit.
    const ald = dateControl.afterLastDeadline;
    const allowsSubmissions = ald?.allowSubmissions === true;
    entries.push({
      kind: 'afterLastDeadline',
      startDate: segStart,
      endDate: null,
      credit: allowsSubmissions ? (ald.credit ?? 0) : 0,
      current: isCurrent(segStart, null),
      submittable: allowsSubmissions,
    });
  }

  // Floor each post-release segment's credit to its predecessor so a stacked
  // override that leaves credit climbing — non-decreasing early deadlines,
  // non-decreasing late deadlines, an afterLastDeadline above the last late
  // — still produces a non-increasing timeline. Validation prevents these
  // shapes per-rule and against defaults; this is a defensive backstop for
  // multi-override merges that the validator deliberately doesn't model.
  // beforeRelease (index 0, credit 0) is excluded so the first real segment
  // isn't clamped to 0.
  for (let i = 2; i < entries.length; i++) {
    if (entries[i].credit > entries[i - 1].credit) {
      entries[i] = { ...entries[i], credit: entries[i - 1].credit };
    }
  }

  return entries;
}
