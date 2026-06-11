import {
  type AccessTimelineEntry,
  type RuntimeDateControl,
  buildAccessTimeline,
} from './timeline.js';

export interface CalendarEventDates {
  /** The release date; also the start of the availability window. */
  release: Date;
  /** The due date; null when no due date is configured or due is indefinite. */
  due: Date | null;
  /**
   * End of the final deadline segment (the availability window's end); null
   * when the window is open-ended.
   */
  windowEnd: Date | null;
  /** Credit for submissions after the final deadline, when still allowed. */
  afterLastDeadlineCredit: number | null;
  /** Credit segments for the detail popover. */
  timeline: AccessTimelineEntry[];
}

/**
 * Projects a resolved date control onto the dates the assessment calendar
 * renders. Returns `null` when the date control has no usable access path (no
 * release configured, or due on/before release) — such assessments are omitted
 * from the calendar.
 *
 * `date` only marks the timeline's `current` segment for popover display; it
 * does not affect which dates are produced.
 */
export function dateControlToCalendarEvents(
  dateControl: RuntimeDateControl | null | undefined,
  date: Date,
): CalendarEventDates | null {
  const timeline = buildAccessTimeline(dateControl ?? undefined, date);
  if (timeline.length === 0) return null;

  // Entry 0 is always the pre-release segment, ending at the release date.
  const release = timeline[0].endDate;
  if (release == null) return null;

  const lastEntry = timeline[timeline.length - 1];
  const deadlineSegments = timeline.filter((e) => e.kind === 'deadline');
  const lastDeadline = deadlineSegments[deadlineSegments.length - 1]?.endDate ?? null;
  // An indefinite due (`due: { date: null }`) shadows any deadlines, so the
  // window is open-ended whenever the timeline ends in a `noDeadline` segment.
  const windowEnd = lastEntry.kind === 'noDeadline' ? null : lastDeadline;

  const due = dateControl?.due?.date ?? null;
  const afterLastDeadlineCredit =
    lastEntry.kind === 'afterLastDeadline' && lastEntry.submittable ? lastEntry.credit : null;

  return { release, due, windowEnd, afterLastDeadlineCredit, timeline };
}
