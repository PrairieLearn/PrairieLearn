import { Temporal } from '@js-temporal/polyfill';
import clsx from 'clsx';
import { parseAsString, useQueryState } from 'nuqs';
import { useState } from 'react';
import OverlayTrigger from 'react-bootstrap/OverlayTrigger';
import Popover from 'react-bootstrap/Popover';

import { formatDate } from '@prairielearn/formatter';
import { run } from '@prairielearn/run';
import { NuqsAdapter } from '@prairielearn/ui';

import type { AccessTimelineEntry } from '../lib/assessment-access-control/timeline.js';
import {
  type CalendarSpanInput,
  type PositionedSpan,
  clampMonth,
  computeWeekLanes,
  dateToPlainDate,
  weeksOfMonth,
} from '../lib/client/assessment-calendar.js';

export interface CalendarAssessmentEvent {
  assessmentId: string;
  title: string;
  /** Assessment label for badges, e.g. "HW3". */
  label: string;
  /** Assessment set color name, e.g. "green1". */
  color: string;
  /** Link target for "View assessment"; null when the viewer can't access it yet. */
  assessmentUrl: string | null;
  /** Link target for "Edit access"; instructors with edit permission only. */
  accessEditUrl: string | null;
  release: Date;
  due: Date | null;
  windowStart: Date;
  /** Null for an open-ended availability window (e.g. no due date). */
  windowEnd: Date | null;
  /** Credit for submissions after the final deadline, when still allowed. */
  afterLastDeadlineCredit: number | null;
  /** Number of non-default access rules; 0 for student views. */
  overrideCount: number;
  timeline: AccessTimelineEntry[];
}

interface SpanPayload {
  event: CalendarAssessmentEvent;
  variant: 'window' | 'release' | 'due';
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MAX_VISIBLE_LANES = 3;

export function AssessmentCalendar({
  search,
  ...props
}: {
  search: string;
  events: CalendarAssessmentEvent[];
  displayTimezone: string;
  /** The server's request date; used for the "today" highlight and default month. */
  now: Date;
}) {
  return (
    <NuqsAdapter search={search}>
      <AssessmentCalendarInner {...props} />
    </NuqsAdapter>
  );
}
AssessmentCalendar.displayName = 'AssessmentCalendar';

function AssessmentCalendarInner({
  events,
  displayTimezone,
  now,
}: {
  events: CalendarAssessmentEvent[];
  displayTimezone: string;
  now: Date;
}) {
  const [monthParam, setMonthParam] = useQueryState('month', parseAsString);
  const [expandedWeeks, setExpandedWeeks] = useState<ReadonlySet<string>>(new Set());

  const today = dateToPlainDate(now, displayTimezone);
  const currentMonth = today.toPlainYearMonth();

  const spans = events.flatMap((event): CalendarSpanInput<SpanPayload>[] => [
    {
      item: { event, variant: 'window' },
      start: dateToPlainDate(event.windowStart, displayTimezone),
      end: event.windowEnd ? dateToPlainDate(event.windowEnd, displayTimezone) : null,
      kind: 'window',
    },
    {
      item: { event, variant: 'release' },
      start: dateToPlainDate(event.release, displayTimezone),
      end: dateToPlainDate(event.release, displayTimezone),
      kind: 'chip',
    },
    ...(event.due
      ? [
          {
            item: { event, variant: 'due' } satisfies SpanPayload,
            start: dateToPlainDate(event.due, displayTimezone),
            end: dateToPlainDate(event.due, displayTimezone),
            kind: 'chip' as const,
          },
        ]
      : []),
  ]);

  // Navigation bounds: from the earliest release to the latest bounded date,
  // widened to include the current month so "Today" is always reachable.
  const [minMonth, maxMonth] = run(() => {
    let min = currentMonth;
    let max = currentMonth;
    for (const span of spans) {
      const startMonth = span.start.toPlainYearMonth();
      const endMonth = (span.end ?? span.start).toPlainYearMonth();
      if (Temporal.PlainYearMonth.compare(startMonth, min) < 0) min = startMonth;
      if (Temporal.PlainYearMonth.compare(endMonth, max) > 0) max = endMonth;
    }
    return [min, max];
  });

  const requestedMonth = run(() => {
    if (!monthParam) return null;
    try {
      return Temporal.PlainYearMonth.from(monthParam);
    } catch {
      return null;
    }
  });
  const month = clampMonth(requestedMonth ?? currentMonth, minMonth, maxMonth);

  const monthTitle = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(month.year, month.month - 1, 1)));

  if (events.length === 0) {
    return (
      <div className="alert alert-secondary mb-0" role="status">
        No assessments have scheduled dates to show on the calendar.
      </div>
    );
  }

  return (
    <div>
      <div className="d-flex align-items-center gap-2 p-2">
        <h2 className="h5 mb-0 ms-1" aria-live="polite">
          {monthTitle}
        </h2>
        <div className="btn-group ms-auto" role="group">
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            aria-label="Previous month"
            disabled={Temporal.PlainYearMonth.compare(month, minMonth) <= 0}
            onClick={() => setMonthParam(month.subtract({ months: 1 }).toString())}
          >
            <i className="bi bi-chevron-left" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            aria-label="Next month"
            disabled={Temporal.PlainYearMonth.compare(month, maxMonth) >= 0}
            onClick={() => setMonthParam(month.add({ months: 1 }).toString())}
          >
            <i className="bi bi-chevron-right" aria-hidden="true" />
          </button>
        </div>
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary"
          disabled={Temporal.PlainYearMonth.compare(month, currentMonth) === 0}
          onClick={() => setMonthParam(null)}
        >
          Today
        </button>
      </div>
      <div
        className="d-grid border-top text-center text-secondary small fw-bold py-1"
        style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}
      >
        {WEEKDAY_LABELS.map((label) => (
          <div key={label}>{label}</div>
        ))}
      </div>
      {weeksOfMonth(month).map((week) => {
        const weekKey = week[0].toString();
        const positioned = computeWeekLanes(spans, week);
        const expanded = expandedWeeks.has(weekKey);
        const visible = expanded
          ? positioned
          : positioned.filter((span) => span.lane < MAX_VISIBLE_LANES);
        const hiddenCount = positioned.length - visible.length;

        return (
          <div key={weekKey} className="border-top px-1 pb-1" style={{ minHeight: '6.5rem' }}>
            <div className="d-grid" style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
              {week.map((day) => (
                <div key={day.toString()} className="small p-1">
                  <span
                    className={clsx(
                      day.month !== month.month && 'text-body-tertiary',
                      day.equals(today) &&
                        'badge rounded-pill text-bg-primary align-text-bottom px-2',
                    )}
                  >
                    {day.day}
                  </span>
                </div>
              ))}
            </div>
            <div
              className="d-grid"
              style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: '2px' }}
            >
              {visible.map((span) => (
                <CalendarSpan
                  key={`${span.item.event.assessmentId}-${span.item.variant}`}
                  span={span}
                  displayTimezone={displayTimezone}
                />
              ))}
            </div>
            {(hiddenCount > 0 || expanded) && (
              <button
                type="button"
                className="btn btn-link btn-sm p-0 mt-1 small"
                onClick={() =>
                  setExpandedWeeks((prev) => {
                    const next = new Set(prev);
                    if (expanded) {
                      next.delete(weekKey);
                    } else {
                      next.add(weekKey);
                    }
                    return next;
                  })
                }
              >
                {expanded ? 'Show less' : `+${hiddenCount} more`}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function CalendarSpan({
  span,
  displayTimezone,
}: {
  span: PositionedSpan<SpanPayload>;
  displayTimezone: string;
}) {
  const { event, variant } = span.item;
  const gridStyle = {
    gridColumn: `${span.startCol} / ${span.endCol + 1}`,
    gridRow: span.lane + 1,
  };

  const trigger =
    variant === 'window' ? (
      <button
        type="button"
        className="btn border-0 rounded-1 px-1 py-0 small text-start text-truncate d-block"
        style={{
          ...gridStyle,
          backgroundColor: `color-mix(in srgb, var(--color-${event.color}) 35%, var(--bs-body-bg))`,
          borderLeft: span.continuesBefore ? undefined : `3px solid var(--color-${event.color})`,
        }}
        aria-label={`${event.label} ${event.title}, available ${formatDate(event.windowStart, displayTimezone)}${
          event.windowEnd ? ` to ${formatDate(event.windowEnd, displayTimezone)}` : ', no end date'
        }`}
      >
        {span.continuesBefore ? '◂ ' : ''}
        {event.label}: {event.title}
        {span.continuesAfter ? ' ▸' : ''}
      </button>
    ) : (
      <button
        type="button"
        className={`btn border-0 badge color-${event.color} px-1 text-start text-truncate d-block`}
        style={gridStyle}
        aria-label={
          variant === 'due'
            ? `${event.label} ${event.title}, due ${formatDate(event.due ?? event.release, displayTimezone)}`
            : `${event.label} ${event.title}, opens ${formatDate(event.release, displayTimezone)}`
        }
      >
        <i
          className={clsx('bi', variant === 'due' ? 'bi-alarm-fill' : 'bi-caret-right-fill')}
          aria-hidden="true"
        />{' '}
        {event.label} {variant === 'due' ? 'due' : 'opens'}
      </button>
    );

  return (
    <OverlayTrigger
      trigger="click"
      placement="auto"
      overlay={<EventPopover event={event} displayTimezone={displayTimezone} />}
      rootClose
    >
      {trigger}
    </OverlayTrigger>
  );
}

function EventPopover({
  event,
  displayTimezone,
  ...popoverProps
}: {
  event: CalendarAssessmentEvent;
  displayTimezone: string;
}) {
  // The after-last-deadline segment is described by the note below the table.
  const submittableEntries = event.timeline.filter(
    (entry) => entry.submittable && entry.kind !== 'afterLastDeadline',
  );
  return (
    <Popover {...popoverProps} id={`assessment-calendar-popover-${event.assessmentId}`}>
      <Popover.Header className="d-flex align-items-center gap-2">
        <span className={`badge color-${event.color}`}>{event.label}</span>
        <span className="me-auto">{event.title}</span>
        {event.overrideCount > 0 && (
          <span className="badge text-bg-warning">
            {event.overrideCount} {event.overrideCount === 1 ? 'override' : 'overrides'}
          </span>
        )}
      </Popover.Header>
      <Popover.Body>
        <div className="mb-2">Opens {formatDate(event.release, displayTimezone)}</div>
        {submittableEntries.length > 0 && (
          <table className="table table-sm mb-2" aria-label="Credit details">
            <thead>
              <tr>
                <th>Credit</th>
                <th>Until</th>
              </tr>
            </thead>
            <tbody>
              {submittableEntries.map((entry) => (
                <tr key={`${entry.credit}-${entry.endDate?.getTime() ?? 'open'}`}>
                  <td>{entry.credit}%</td>
                  <td>{entry.endDate ? formatDate(entry.endDate, displayTimezone) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {event.afterLastDeadlineCredit != null && (
          <div className="small text-secondary mb-2">
            Submissions after the final deadline receive {event.afterLastDeadlineCredit}% credit.
          </div>
        )}
        <div className="d-flex gap-2">
          {event.assessmentUrl && (
            <a className="btn btn-sm btn-primary" href={event.assessmentUrl}>
              View assessment
            </a>
          )}
          {event.accessEditUrl && (
            <a className="btn btn-sm btn-outline-secondary" href={event.accessEditUrl}>
              Edit access
            </a>
          )}
        </div>
      </Popover.Body>
    </Popover>
  );
}
