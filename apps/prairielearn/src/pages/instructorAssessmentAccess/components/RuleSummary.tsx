import { Temporal } from '@js-temporal/polyfill';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { Fragment, type ReactNode } from 'react';
import { Button, Card } from 'react-bootstrap';
import { type FieldErrors, get } from 'react-hook-form';

import { run } from '@prairielearn/run';

import { FriendlyDate } from '../../../components/FriendlyDate.js';
import { StudentLabelBadge } from '../../../components/StudentLabelBadge.js';
import {
  type AccessTimelineEntry,
  type RuntimeDateControl,
  buildAccessTimeline,
} from '../../../lib/assessment-access-control/timeline.js';
import { UUID_REGEXP } from '../../../lib/string-util.js';
import type { PrairieTestExamMetadata } from '../../../models/assessment-access-control-rules.js';
import { useTRPC } from '../../../trpc/assessment/context.js';

import { getAfterLastDeadlineLabel } from './fields/AfterLastDeadlineField.js';
import {
  type AfterLastDeadlineValue,
  type DeadlineEntry,
  type DefaultRuleData,
  type OverrideData,
  isNonDefaultQuestionVisibility,
  isNonDefaultScoreVisibility,
} from './types.js';

function formatCreditPercent(credit: number): string {
  return Number.isFinite(credit) ? `${credit}%` : '—';
}

/** react-hook-form error subtree for an override rule. */
export type OverrideRuleFormErrors = FieldErrors<OverrideData>;
type DefaultRuleFormErrors = FieldErrors<DefaultRuleData>;

interface DateTableRow {
  date: ReactNode;
  label: string;
  access: string;
  error?: string;
  current?: boolean;
  currentVariant?: 'success' | 'primary';
}

function formatListedForStudents(listed: boolean): string {
  return listed ? 'Listed for students' : 'Hidden from students';
}

/**
 * Convert a form datetime-local string into an absolute instant in `timezone`.
 * Returns null on empty/invalid input — the form may briefly hold partial
 * values during editing.
 */
function toRuntimeDate(value: string | null | undefined, timezone: string): Date | null {
  if (!value) return null;
  try {
    return new Date(
      Temporal.PlainDateTime.from(value).toZonedDateTime(timezone).toInstant().epochMilliseconds,
    );
  } catch {
    return null;
  }
}

/**
 * Convert default rule form data into the runtime shape consumed by
 * `buildAccessTimeline`. Returns undefined when date control is disabled,
 * or when any enabled date field has a value that fails to parse — both
 * cases short-circuit the timeline to no segments so the indicator and
 * row highlighting fall silent during transient invalid edits, rather
 * than misrepresenting the rule.
 */
function defaultRuleToRuntimeDateControl(
  rule: DefaultRuleData,
  displayTimezone: string,
): RuntimeDateControl | undefined {
  if (!rule.dateControlEnabled) return undefined;
  if (rule.release.date === null) return undefined;
  const releaseDateString = rule.release.date;

  // An unparseable date should suppress the timeline.
  if (
    [
      releaseDateString,
      ...rule.earlyDeadlines.map((e) => e.date),
      ...rule.lateDeadlines.map((e) => e.date),
      // Ignore due.date === null
      ...(rule.due.date === null ? [] : [rule.due.date]),
    ].some((s) => toRuntimeDate(s, displayTimezone) === null)
  ) {
    return undefined;
  }

  const earlyDeadlines = rule.earlyDeadlines.map((e) => ({
    date: toRuntimeDate(e.date, displayTimezone)!.toISOString(),
    credit: e.credit,
  }));
  const lateDeadlines = rule.lateDeadlines.map((e) => ({
    date: toRuntimeDate(e.date, displayTimezone)!.toISOString(),
    credit: e.credit,
  }));

  // Mirror defaultRuleToJson: omit `due` entirely when no date is set and no
  // custom credit is applied. Passing `due: { date: null }` would otherwise
  // trigger the timeline's `noDeadline` branch.
  const includeDue = rule.due.date !== null || rule.due.customCredit;

  return {
    release: { date: toRuntimeDate(releaseDateString, displayTimezone)! },
    ...(includeDue
      ? {
          due: {
            date: rule.due.date === null ? null : toRuntimeDate(rule.due.date, displayTimezone)!,
            ...(rule.due.customCredit && rule.due.credit != null
              ? { credit: rule.due.credit }
              : {}),
          },
        }
      : {}),
    ...(earlyDeadlines.length > 0 ? { earlyDeadlines } : {}),
    ...(lateDeadlines.length > 0 ? { lateDeadlines } : {}),
    ...(rule.afterLastDeadline.allowSubmissions
      ? {
          afterLastDeadline: {
            allowSubmissions: true as const,
            credit: rule.afterLastDeadline.credit,
          },
        }
      : {}),
  };
}

interface DefaultRuleCurrentState {
  rdc: RuntimeDateControl | undefined;
  segment: AccessTimelineEntry | null;
}

function getDefaultRuleCurrentState(
  rule: DefaultRuleData,
  displayTimezone: string,
): DefaultRuleCurrentState {
  const rdc = defaultRuleToRuntimeDateControl(rule, displayTimezone);
  if (!rdc) return { rdc: undefined, segment: null };
  const segment = buildAccessTimeline(rdc, new Date()).find((s) => s.current) ?? null;
  return { rdc, segment };
}

export function generateDefaultRuleDateTableRows(
  rule: DefaultRuleData,
  displayTimezone: string,
  formErrors?: DefaultRuleFormErrors,
): DateTableRow[] {
  if (!rule.dateControlEnabled) return [];

  const rows: DateTableRow[] = [];

  const releaseDate = rule.release.date;
  const dueDate = rule.due.date;
  const dueCredit = rule.due.credit ?? 100;

  // Build rows in logical order: release, early deadlines, due date, late deadlines.
  const afterLastDeadline = rule.afterLastDeadline;
  const releaseDateError = formErrors?.release?.date?.message;

  const { segment } = getDefaultRuleCurrentState(rule, displayTimezone);
  const segmentEnd = segment?.endDate
    ? Temporal.Instant.fromEpochMilliseconds(segment.endDate.getTime())
        .toZonedDateTimeISO(displayTimezone)
        .toPlainDateTime()
    : null;
  const isBeforeReleaseSegment = segment?.kind === 'beforeRelease';
  const isAfterLastSegment = segment?.kind === 'afterLastDeadline';
  const isNoDeadlineSegment = segment?.kind === 'noDeadline';

  // Available (open and submittable) → green border; otherwise blue.
  const currentVariant: 'success' | 'primary' =
    segment != null && segment.kind !== 'beforeRelease' && segment.submittable
      ? 'success'
      : 'primary';

  const isDeadlineCurrent = (formDateString: string): boolean => {
    if (segmentEnd == null) return false;
    try {
      return Temporal.PlainDateTime.from(formDateString).equals(segmentEnd);
    } catch {
      return false;
    }
  };

  rows.push({
    date: '',
    label: 'Before release',
    access: formatListedForStudents(rule.beforeReleaseListed),
    current: isBeforeReleaseSegment,
    currentVariant,
  });

  if (releaseDate || releaseDateError) {
    rows.push({
      date: releaseDate ? (
        <FriendlyDate
          date={Temporal.PlainDateTime.from(releaseDate)}
          timezone={displayTimezone}
          options={{ includeTz: false }}
          tooltip
        />
      ) : (
        'No date set'
      ),
      label: 'Release',
      access: 'Opens',
      error: releaseDateError,
    });
  }

  rule.earlyDeadlines.forEach((deadline: DeadlineEntry, index: number) => {
    const dateErr = formErrors?.earlyDeadlines?.[index]?.date?.message;
    const creditErr = formErrors?.earlyDeadlines?.[index]?.credit?.message;
    rows.push({
      date: deadline.date ? (
        <FriendlyDate
          date={Temporal.PlainDateTime.from(deadline.date)}
          timezone={displayTimezone}
          options={{ includeTz: false }}
          tooltip
        />
      ) : (
        'No date set'
      ),
      label: `Early ${index + 1}`,
      access: formatCreditPercent(deadline.credit),
      error: [dateErr, creditErr].filter(Boolean).join('; ') || undefined,
      current: deadline.date ? isDeadlineCurrent(deadline.date) : false,
      currentVariant,
    });
  });

  const dueDateErr = formErrors?.due?.date?.message;
  const dueCreditErr = formErrors?.due?.credit?.message;
  const dueError = [dueDateErr, dueCreditErr].filter(Boolean).join('; ') || undefined;

  if (dueDate) {
    rows.push({
      date: (
        <FriendlyDate
          date={Temporal.PlainDateTime.from(dueDate)}
          timezone={displayTimezone}
          options={{ includeTz: false }}
          tooltip
        />
      ),
      label: 'Due',
      access: formatCreditPercent(dueCredit),
      error: dueError,
      current: isDeadlineCurrent(dueDate),
      currentVariant,
    });
  } else if (dueDate === null) {
    rows.push({
      date: 'No due date',
      label: 'Due',
      access: formatCreditPercent(dueCredit),
      error: dueError,
      current: isNoDeadlineSegment,
      currentVariant,
    });
  } else {
    // dueDate is an empty string — "Due on date" selected but no date entered
    rows.push({
      date: 'No date set',
      label: 'Due',
      access: formatCreditPercent(dueCredit),
      error: dueError,
    });
  }

  rule.lateDeadlines.forEach((deadline: DeadlineEntry, index: number) => {
    const dateErr = formErrors?.lateDeadlines?.[index]?.date?.message;
    const creditErr = formErrors?.lateDeadlines?.[index]?.credit?.message;
    rows.push({
      date: deadline.date ? (
        <FriendlyDate
          date={Temporal.PlainDateTime.from(deadline.date)}
          timezone={displayTimezone}
          options={{ includeTz: false }}
          tooltip
        />
      ) : (
        'No date set'
      ),
      label: `Late ${index + 1}`,
      access: formatCreditPercent(deadline.credit),
      error: [dateErr, creditErr].filter(Boolean).join('; ') || undefined,
      current: deadline.date ? isDeadlineCurrent(deadline.date) : false,
      currentVariant,
    });
  });

  // Show the after-last-deadline row only when there is a deadline it can apply to.
  const hasAnyDeadline = rule.due.date || rule.lateDeadlines.some((d) => d.date);

  if (hasAnyDeadline) {
    rows.push({
      date: '',
      label: getAfterLastDeadlineLabel(rule.lateDeadlines),
      access: afterLastDeadline.allowSubmissions
        ? afterLastDeadline.credit > 0
          ? formatCreditPercent(afterLastDeadline.credit)
          : 'Practice'
        : 'No submissions allowed',
      error: get(formErrors, 'afterLastDeadline.credit')?.message,
      current: isAfterLastSegment,
      currentVariant,
    });
  }

  return rows;
}

interface AfterCompleteTableRow {
  key: string;
  timeRange: ReactNode;
  questionsVisible: boolean;
  scoreVisible: boolean;
  errors?: string[];
}

interface AfterCompleteVisibilityEvent {
  date: string;
  questionsVisible?: boolean;
  scoreVisible?: boolean;
}

type SummaryBadgeVariant = 'success' | 'danger' | 'warning' | 'info' | 'muted';

function SummaryBadge({
  children,
  icon,
  variant = 'muted',
}: {
  children: ReactNode;
  icon?: string;
  variant?: SummaryBadgeVariant;
}) {
  const className = run(() => {
    switch (variant) {
      case 'success':
        return 'bg-success-subtle border border-success-subtle text-success-emphasis';
      case 'danger':
        return 'bg-danger-subtle border border-danger-subtle text-danger-emphasis';
      case 'warning':
        return 'bg-warning-subtle border border-warning-subtle text-warning-emphasis';
      case 'info':
        return 'bg-info-subtle border border-info-subtle text-info-emphasis';
      case 'muted':
        return 'bg-body-tertiary border text-body-secondary';
    }
  });

  return (
    <span
      className={`badge rounded-pill d-inline-flex align-items-center gap-1 fw-medium ${className}`}
    >
      {icon && <i className={`bi ${icon}`} aria-hidden="true" />}
      {children}
    </span>
  );
}

function VisibilityBadge({ visible }: { visible: boolean }) {
  return (
    <SummaryBadge
      variant={visible ? 'success' : 'danger'}
      icon={visible ? 'bi-eye' : 'bi-eye-slash'}
    >
      {visible ? 'Shown' : 'Hidden'}
    </SummaryBadge>
  );
}

function AfterCompleteTimeRange({
  date,
  displayTimezone,
}: {
  date: string;
  displayTimezone: string;
}) {
  return (
    <>
      After{' '}
      <FriendlyDate
        date={Temporal.PlainDateTime.from(date)}
        timezone={displayTimezone}
        options={{ includeTz: false }}
        tooltip
      />
    </>
  );
}

function buildAfterCompleteVisibilityEvents(rule: DefaultRuleData): AfterCompleteVisibilityEvent[] {
  const events: AfterCompleteVisibilityEvent[] = [];
  const qv = rule.questionVisibility;
  const sv = rule.scoreVisibility;

  if (qv.hidden && qv.visibleFromDate) {
    events.push({
      date: qv.visibleFromDate,
      questionsVisible: true,
    });
    if (qv.visibleUntilDate) {
      events.push({
        date: qv.visibleUntilDate,
        questionsVisible: false,
      });
    }
  }

  if (sv.hidden && sv.visibleFromDate) {
    events.push({
      date: sv.visibleFromDate,
      scoreVisible: true,
    });
  }

  return events.sort((a, b) => {
    try {
      return Temporal.PlainDateTime.compare(
        Temporal.PlainDateTime.from(a.date),
        Temporal.PlainDateTime.from(b.date),
      );
    } catch {
      return 0;
    }
  });
}

export function generateAfterCompleteTableRows(
  rule: DefaultRuleData,
  displayTimezone: string,
  formErrors?: DefaultRuleFormErrors,
): AfterCompleteTableRow[] {
  const hasDateControl = rule.dateControlEnabled;
  const hasPrairieTest = rule.prairieTestExams.length > 0;
  const showAfterComplete = hasDateControl || hasPrairieTest;

  const qvNonDefault = isNonDefaultQuestionVisibility(rule.questionVisibility);
  const svNonDefault = isNonDefaultScoreVisibility(rule.scoreVisibility);
  const showQuestions = showAfterComplete || qvNonDefault;
  const showScore = showAfterComplete || svNonDefault;

  if (!showQuestions && !showScore) return [];

  const qv = rule.questionVisibility;
  const sv = rule.scoreVisibility;
  const errors = [
    formErrors?.questionVisibility?.visibleFromDate?.message,
    formErrors?.questionVisibility?.visibleUntilDate?.message,
    formErrors?.questionVisibility?.message,
    formErrors?.scoreVisibility?.visibleFromDate?.message,
    formErrors?.scoreVisibility?.message,
  ].filter((error): error is string => !!error);

  let questionsVisible = !qv.hidden;
  let scoreVisible = !sv.hidden;
  const rows: AfterCompleteTableRow[] = [
    {
      key: 'immediately',
      timeRange: 'Immediately after completion',
      questionsVisible,
      scoreVisible,
      errors,
    },
  ];

  const events = buildAfterCompleteVisibilityEvents(rule);
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (event.questionsVisible !== undefined) questionsVisible = event.questionsVisible;
    if (event.scoreVisible !== undefined) scoreVisible = event.scoreVisible;
    while (events[i + 1]?.date === event.date) {
      i++;
      const nextEvent = events[i];
      if (nextEvent.questionsVisible !== undefined) questionsVisible = nextEvent.questionsVisible;
      if (nextEvent.scoreVisible !== undefined) scoreVisible = nextEvent.scoreVisible;
    }
    rows.push({
      key: `after-${event.date || i}`,
      timeRange: <AfterCompleteTimeRange date={event.date} displayTimezone={displayTimezone} />,
      questionsVisible,
      scoreVisible,
    });
  }

  return rows;
}

interface OverrideFieldItem {
  label: string;
  value: ReactNode;
  error?: string;
}

function formatDeadlineEntries(
  deadlines: DeadlineEntry[],
  displayTimezone: string,
  labelPrefix: string,
  deadlineErrors?: (string | undefined)[],
): OverrideFieldItem[] {
  return deadlines.map((entry, i) => ({
    label: deadlines.length === 1 ? `${labelPrefix} deadline` : `${labelPrefix} deadline ${i + 1}`,
    value: entry.date ? (
      <>
        <FriendlyDate
          date={Temporal.PlainDateTime.from(entry.date)}
          timezone={displayTimezone}
          options={{ includeTz: false }}
          tooltip
        />{' '}
        ({formatCreditPercent(entry.credit)} credit)
      </>
    ) : (
      `No date set (${formatCreditPercent(entry.credit)} credit)`
    ),
    error: deadlineErrors?.[i],
  }));
}

function formatAfterLastDeadline(afterLastDeadline: AfterLastDeadlineValue): string {
  const parts: string[] = [];
  if (
    afterLastDeadline.allowSubmissions &&
    afterLastDeadline.credit > 0 &&
    Number.isFinite(afterLastDeadline.credit)
  ) {
    parts.push(`${afterLastDeadline.credit}% credit`);
  }
  if (afterLastDeadline.allowSubmissions) {
    parts.push(parts.length > 0 ? 'submissions allowed' : 'Practice submissions allowed');
  } else {
    parts.push('No submissions allowed');
  }
  return parts.join(', ');
}

function HiddenAfterCompletionVisibility({
  visibleFromDate,
  visibleUntilDate,
  displayTimezone,
}: {
  visibleFromDate?: string;
  visibleUntilDate?: string;
  displayTimezone: string;
}) {
  if (visibleFromDate && visibleUntilDate) {
    return (
      <>
        Hidden after completion; visible from{' '}
        <FriendlyDate
          date={Temporal.PlainDateTime.from(visibleFromDate)}
          timezone={displayTimezone}
          options={{ includeTz: false }}
          tooltip
        />{' '}
        until{' '}
        <FriendlyDate
          date={Temporal.PlainDateTime.from(visibleUntilDate)}
          timezone={displayTimezone}
          options={{ includeTz: false }}
          tooltip
        />
      </>
    );
  }

  if (visibleFromDate) {
    return (
      <>
        Hidden after completion; visible starting{' '}
        <FriendlyDate
          date={Temporal.PlainDateTime.from(visibleFromDate)}
          timezone={displayTimezone}
          options={{ includeTz: false }}
          tooltip
        />
      </>
    );
  }

  return 'Hidden after completion';
}

function generateOverrideFieldItems(
  rule: OverrideData,
  displayTimezone: string,
  formErrors?: OverrideRuleFormErrors,
): OverrideFieldItem[] {
  const items: OverrideFieldItem[] = [];
  const overriddenFields = new Set(rule.overriddenFields);

  if (overriddenFields.has('release')) {
    // A null/empty release date means "not released" (resolver returns active: false).
    // TODO: enforce non-null release dates on overrides so this case goes away.
    items.push({
      label: 'Release date',
      value: rule.release.date ? (
        <FriendlyDate
          date={Temporal.PlainDateTime.from(rule.release.date)}
          timezone={displayTimezone}
          options={{ includeTz: false }}
          tooltip
        />
      ) : (
        'Not released'
      ),
      error: formErrors?.release?.date?.message,
    });
  }

  if (overriddenFields.has('earlyDeadlines')) {
    const earlyDeadlineErrors = rule.earlyDeadlines.map((_entry, i) => {
      const dateErr = formErrors?.earlyDeadlines?.[i]?.date?.message;
      const creditErr = formErrors?.earlyDeadlines?.[i]?.credit?.message;
      return [dateErr, creditErr].filter(Boolean).join('; ') || undefined;
    });
    const earlyItems = formatDeadlineEntries(
      rule.earlyDeadlines,
      displayTimezone,
      'Early',
      earlyDeadlineErrors,
    );
    items.push(
      ...(earlyItems.length > 0 ? earlyItems : [{ label: 'Early deadlines', value: 'None' }]),
    );
  }

  if (overriddenFields.has('due')) {
    const creditLabel = rule.due.credit != null ? ` (${formatCreditPercent(rule.due.credit)})` : '';
    const dueDateErr = formErrors?.due?.date?.message;
    const dueCreditErr = formErrors?.due?.credit?.message;
    items.push({
      label: 'Due date',
      value: rule.due.date ? (
        <>
          <FriendlyDate
            date={Temporal.PlainDateTime.from(rule.due.date)}
            timezone={displayTimezone}
            options={{ includeTz: false }}
            tooltip
          />
          {creditLabel}
        </>
      ) : (
        'No due date'
      ),
      error: [dueDateErr, dueCreditErr].filter(Boolean).join('; ') || undefined,
    });
  }

  if (overriddenFields.has('lateDeadlines')) {
    const lateDeadlineErrors = rule.lateDeadlines.map((_entry, i) => {
      const dateErr = formErrors?.lateDeadlines?.[i]?.date?.message;
      const creditErr = formErrors?.lateDeadlines?.[i]?.credit?.message;
      return [dateErr, creditErr].filter(Boolean).join('; ') || undefined;
    });
    const lateItems = formatDeadlineEntries(
      rule.lateDeadlines,
      displayTimezone,
      'Late',
      lateDeadlineErrors,
    );
    items.push(
      ...(lateItems.length > 0 ? lateItems : [{ label: 'Late deadlines', value: 'None' }]),
    );
  }

  if (overriddenFields.has('afterLastDeadline')) {
    items.push({
      label: 'After last deadline',
      value: formatAfterLastDeadline(rule.afterLastDeadline),
      error: get(formErrors, 'afterLastDeadline.credit')?.message,
    });
  }

  if (overriddenFields.has('durationMinutes')) {
    items.push({
      label: 'Time limit',
      value: rule.durationMinutes !== null ? `${rule.durationMinutes} minutes` : 'No time limit',
      error: formErrors?.durationMinutes?.message,
    });
  }

  if (overriddenFields.has('password')) {
    items.push({
      label: 'Password',
      value: rule.password ? 'Required to start or submit' : 'No password',
      error: formErrors?.password?.message,
    });
  }

  if (overriddenFields.has('questionVisibility')) {
    const qv = rule.questionVisibility;
    const qvError =
      formErrors?.questionVisibility?.visibleFromDate?.message ||
      formErrors?.questionVisibility?.visibleUntilDate?.message ||
      formErrors?.questionVisibility?.message;
    if (qv.hidden) {
      items.push({
        label: 'Question visibility',
        value: (
          <HiddenAfterCompletionVisibility
            visibleFromDate={qv.visibleFromDate}
            visibleUntilDate={qv.visibleUntilDate}
            displayTimezone={displayTimezone}
          />
        ),
        error: qvError,
      });
    } else {
      items.push({
        label: 'Question visibility',
        value: 'Visible after completion',
        error: qvError,
      });
    }
  }

  if (overriddenFields.has('scoreVisibility')) {
    const sv = rule.scoreVisibility;
    const svError =
      formErrors?.scoreVisibility?.visibleFromDate?.message || formErrors?.scoreVisibility?.message;
    if (sv.hidden) {
      items.push({
        label: 'Score visibility',
        value: (
          <HiddenAfterCompletionVisibility
            visibleFromDate={sv.visibleFromDate}
            displayTimezone={displayTimezone}
          />
        ),
        error: svError,
      });
    } else {
      items.push({
        label: 'Score visibility',
        value: 'Visible after completion',
        error: svError,
      });
    }
  }

  return items;
}

function OverrideFieldsList({ items }: { items: OverrideFieldItem[] }) {
  if (items.length === 0) return null;
  return (
    <table className="table table-sm table-borderless mb-0">
      <tbody>
        {items.map((item) => (
          <tr key={item.label}>
            <td
              className={`fw-medium p-0 pe-3 pb-1 ${item.error ? 'text-danger' : 'text-body-secondary'}`}
              style={{
                whiteSpace: 'nowrap',
                width: '1%',
              }}
            >
              {item.label}
            </td>
            <td className="p-0 pb-1">
              {item.error ? (
                <div>
                  <span className="text-danger">
                    <i className="bi bi-exclamation-circle me-1" aria-hidden="true" />
                    {item.value}
                  </span>
                  <div className="text-danger small">{item.error}</div>
                </div>
              ) : (
                item.value
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CreditBadge({ credit }: { credit: string }) {
  if (!credit) return null;

  const numericValue = Number.parseInt(credit, 10);
  let variant: SummaryBadgeVariant;

  if (Number.isNaN(numericValue)) {
    variant = 'muted';
  } else if (numericValue > 100) {
    variant = 'info';
  } else if (numericValue === 100) {
    variant = 'success';
  } else if (numericValue === 0) {
    variant = 'danger';
  } else {
    variant = 'warning';
  }

  return <SummaryBadge variant={variant}>{credit}</SummaryBadge>;
}

function YesNoBadge({ value }: { value: boolean | null }) {
  if (value === null) {
    return <span className="text-body-secondary">—</span>;
  }
  return (
    <SummaryBadge variant={value ? 'success' : 'warning'}>{value ? 'Yes' : 'No'}</SummaryBadge>
  );
}

function SummaryCardHeader({
  icon,
  title,
  headingId,
}: {
  icon: string;
  title: string;
  headingId: string;
}) {
  return (
    <div className="access-summary-card-header">
      <i className={`bi ${icon} text-body-secondary`} aria-hidden="true" />
      <h3 className="h6" id={headingId}>
        {title}
      </h3>
    </div>
  );
}

const DATE_CONTROL_HEADING_ID = 'access-summary-heading-date-control';
const PRAIRIE_TEST_HEADING_ID = 'access-summary-heading-prairie-test';
const AFTER_COMPLETION_HEADING_ID = 'access-summary-heading-after-completion';

export function DateTableView({
  rows,
  rule,
  formErrors,
}: {
  rows: DateTableRow[];
  rule: DefaultRuleData;
  formErrors: FieldErrors<DefaultRuleData> | undefined;
}) {
  // The footer (time limit, password) renders inside this table, so it only
  // appears when the table itself does. That's intentional: setting either
  // field flips `dateControlEnabled` to true, which always produces at least
  // one row (a "No due date" row, if nothing else).
  if (rows.length === 0) return null;

  const footerItems: ReactNode[] = [];
  if (rule.durationMinutes != null) {
    const error = formErrors?.durationMinutes?.message;
    if (!error) {
      footerItems.push(`${rule.durationMinutes} min time limit`);
    } else {
      footerItems.push(
        <span className="text-danger">
          <i className="bi bi-exclamation-circle" aria-hidden="true" />
          &nbsp;Missing time limit
        </span>,
      );
    }
  }
  if (rule.password != null) {
    const error = formErrors?.password?.message;
    if (!error) {
      footerItems.push('Password required to start or submit');
    } else {
      footerItems.push(
        <span className="text-danger">
          <i className="bi bi-exclamation-circle" aria-hidden="true" />
          &nbsp;Missing password
        </span>,
      );
    }
  }

  return (
    <div className="access-summary-card access-summary-card--cols-2">
      <SummaryCardHeader
        icon="bi-calendar3"
        title="Date control"
        headingId={DATE_CONTROL_HEADING_ID}
      />
      <div className="access-summary-rows" role="table" aria-labelledby={DATE_CONTROL_HEADING_ID}>
        <div className="access-summary-row access-summary-row--headers" role="row">
          <div
            className="access-summary-cell access-summary-cell--header access-summary-cell--first"
            role="columnheader"
          >
            Date
          </div>
          <div
            className="access-summary-cell access-summary-cell--header access-summary-cell--span-rest"
            role="columnheader"
          >
            Access
          </div>
        </div>
        {rows.map((row, index) => (
          // eslint-disable-next-line @eslint-react/no-array-index-key
          <div key={index} className="access-summary-row" role="row">
            <div
              className={clsx(
                'access-summary-cell access-summary-cell--first',
                row.current &&
                  `assessment-access-date-cell-current assessment-access-date-cell-current-${row.currentVariant ?? 'primary'}`,
              )}
              role="cell"
            >
              <div className="text-nowrap">
                {row.label && (
                  <span className={`me-1 ${row.error ? 'text-danger' : 'text-body-secondary'}`}>
                    {row.label}
                    {row.date ? ':' : ''}
                  </span>
                )}
                {row.error ? <span className="text-danger">{row.date}</span> : row.date}
              </div>
              {row.error && (
                <div className="text-danger small">
                  <i className="bi bi-exclamation-circle me-1" aria-hidden="true" />
                  {row.error}
                </div>
              )}
            </div>
            <div className="access-summary-cell access-summary-cell--span-rest" role="cell">
              <CreditBadge credit={row.access} />
            </div>
          </div>
        ))}
      </div>
      {footerItems.length > 0 && (
        <div className="access-summary-card-footer">
          {footerItems.map((item, index) => (
            // eslint-disable-next-line @eslint-react/no-array-index-key
            <Fragment key={index}>
              <span>{item}</span>
              {index < footerItems.length - 1 && <span className="mx-1">·</span>}
            </Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

export function AfterCompleteTableView({ rows }: { rows: AfterCompleteTableRow[] }) {
  if (rows.length === 0) return null;
  const errors = Array.from(new Set(rows.flatMap((row) => row.errors ?? [])));
  return (
    <div className="access-summary-card access-summary-card--cols-3">
      <SummaryCardHeader
        icon="bi-check2-circle"
        title="After completion"
        headingId={AFTER_COMPLETION_HEADING_ID}
      />
      <div
        className="access-summary-rows"
        role="table"
        aria-labelledby={AFTER_COMPLETION_HEADING_ID}
      >
        <div className="access-summary-row access-summary-row--headers" role="row">
          <div
            className="access-summary-cell access-summary-cell--header access-summary-cell--first"
            role="columnheader"
          >
            Time range
          </div>
          <div className="access-summary-cell access-summary-cell--header" role="columnheader">
            Question visibility
          </div>
          <div className="access-summary-cell access-summary-cell--header" role="columnheader">
            Score visibility
          </div>
        </div>
        {rows.map((row) => (
          <div key={row.key} className="access-summary-row" role="row">
            <div className="access-summary-cell access-summary-cell--first" role="cell">
              {row.timeRange}
            </div>
            <div className="access-summary-cell text-nowrap" role="cell">
              <VisibilityBadge visible={row.questionsVisible} />
            </div>
            <div className="access-summary-cell text-nowrap" role="cell">
              <VisibilityBadge visible={row.scoreVisible} />
            </div>
          </div>
        ))}
      </div>
      {errors.length > 0 && (
        <div className="access-summary-card-footer text-danger">
          {errors.map((error) => (
            <div key={error}>
              <i className="bi bi-exclamation-circle me-1" aria-hidden="true" />
              {error}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface CurrentIndicator {
  variant: 'success' | 'primary' | 'secondary';
  icon: string;
  text: ReactNode;
}

function buildDefaultRuleCurrentIndicator(
  rule: DefaultRuleData,
  displayTimezone: string,
): CurrentIndicator | null {
  const { rdc, segment } = getDefaultRuleCurrentState(rule, displayTimezone);

  // Mirrors the resolver's `showBeforeRelease`: students see a "coming soon"
  // listing when `beforeReleaseListed` is set and either no release date is
  // configured OR the current time is before the release.
  const listedBeforeRelease =
    rule.beforeReleaseListed && (!rdc || segment?.kind === 'beforeRelease');

  if (!segment) {
    if (listedBeforeRelease) {
      return {
        variant: 'primary',
        icon: 'bi-eye',
        text: 'Listed but not accessible',
      };
    }
    return null;
  }

  const friendlyDate = (date: Date) => (
    <FriendlyDate date={date} timezone={displayTimezone} options={{ includeTz: false }} tooltip />
  );

  if (segment.kind === 'beforeRelease') {
    const opensAt = segment.endDate;
    if (listedBeforeRelease) {
      return {
        variant: 'primary',
        icon: 'bi-eye',
        text: opensAt ? (
          <>Listed but not accessible · opens {friendlyDate(opensAt)}</>
        ) : (
          'Listed but not accessible'
        ),
      };
    }
    return {
      variant: 'primary',
      icon: 'bi-eye-slash',
      text: opensAt ? <>Hidden · opens {friendlyDate(opensAt)}</> : 'Hidden',
    };
  }

  if (!segment.submittable) {
    return { variant: 'primary', icon: 'bi-lock', text: 'No submissions allowed' };
  }

  if (segment.endDate) {
    return {
      variant: 'success',
      icon: 'bi-unlock',
      text: (
        <>
          Open · {formatCreditPercent(segment.credit)} credit until {friendlyDate(segment.endDate)}
        </>
      ),
    };
  }
  return {
    variant: 'success',
    icon: 'bi-unlock',
    text: `Open · ${formatCreditPercent(segment.credit)} credit`,
  };
}

export function DefaultRuleCurrentIndicator({
  rule,
  displayTimezone,
}: {
  rule: DefaultRuleData;
  displayTimezone: string;
}) {
  const indicator = buildDefaultRuleCurrentIndicator(rule, displayTimezone);
  if (!indicator) return null;
  return (
    <div
      className={`d-flex align-items-center gap-2 px-3 py-2 rounded bg-${indicator.variant}-subtle text-${indicator.variant}-emphasis`}
      role="status"
    >
      <i className={`bi ${indicator.icon}`} aria-hidden="true" />
      <span>
        <strong>Current:</strong> {indicator.text}
      </span>
    </div>
  );
}

export function PrairieTestExamsTable({
  exams,
  beforeReleaseListed,
  initialMetadata,
  ptHost,
  formErrors,
  canFetchMetadata,
}: {
  exams: DefaultRuleData['prairieTestExams'];
  beforeReleaseListed: boolean;
  initialMetadata: PrairieTestExamMetadata[];
  ptHost: string;
  formErrors?: FieldErrors<DefaultRuleData>;
  canFetchMetadata: boolean;
}) {
  const trpc = useTRPC();

  const validExamUuids = Array.from(
    new Set(
      exams
        .map((e) => e.examUuid)
        .filter((u) => UUID_REGEXP.test(u))
        .map((u) => u.toLowerCase()),
    ),
  ).sort();

  // Re-fetches when the set of valid UUIDs changes, but not while the user is
  // mid-edit on an invalid UUID. Falls back to the server-rendered initial
  // metadata until the first query result lands.
  const { data: metadata } = useQuery({
    ...trpc.accessControl.prairieTestExamMetadata.queryOptions({ examUuids: validExamUuids }),
    enabled: canFetchMetadata && validExamUuids.length > 0,
    initialData: initialMetadata,
  });

  if (exams.length === 0) return null;

  const metadataByUuid = new Map(metadata.map((m) => [m.uuid.toLowerCase(), m]));

  return (
    <div className="access-summary-card access-summary-card--cols-3">
      <SummaryCardHeader
        icon="bi-pc-display"
        title="PrairieTest"
        headingId={PRAIRIE_TEST_HEADING_ID}
      />
      <div className="access-summary-rows" role="table" aria-labelledby={PRAIRIE_TEST_HEADING_ID}>
        <div className="access-summary-row access-summary-row--headers" role="row">
          <div
            className="access-summary-cell access-summary-cell--header access-summary-cell--first"
            role="columnheader"
          >
            Exam
          </div>
          <div className="access-summary-cell access-summary-cell--header" role="columnheader">
            Allows submissions
          </div>
          <div className="access-summary-cell access-summary-cell--header" role="columnheader">
            After completion
          </div>
        </div>
        {exams.map((exam, index) => {
          const meta = metadataByUuid.get(exam.examUuid.toLowerCase());
          const uuidError = formErrors?.prairieTestExams?.[index]?.examUuid?.message;
          const examLink =
            meta?.pt_course_id && meta.pt_exam_id
              ? `${ptHost}/pt/course/${meta.pt_course_id}/staff/exam/${meta.pt_exam_id}`
              : null;
          const examName =
            meta?.pt_course_name && meta.pt_exam_name
              ? `${meta.pt_course_name}: ${meta.pt_exam_name}`
              : null;

          return (
            // We don't use UUID as they might be duplicated in the list.
            // eslint-disable-next-line @eslint-react/no-array-index-key
            <div key={index} className="access-summary-row" role="row">
              <div className="access-summary-cell access-summary-cell--first" role="cell">
                {uuidError ? (
                  <span className="text-danger">
                    <i className="bi bi-exclamation-circle me-1" aria-hidden="true" />
                    {uuidError}
                  </span>
                ) : examName && examLink ? (
                  <a href={examLink} target="_blank" rel="noopener noreferrer">
                    {examName}
                  </a>
                ) : (
                  <span className="text-body-secondary">Unknown exam</span>
                )}
              </div>
              <div className="access-summary-cell text-nowrap" role="cell">
                <YesNoBadge value={!exam.readOnly} />
              </div>
              <div className="access-summary-cell text-nowrap" role="cell">
                {run(() => {
                  if (exam.readOnly) return <>&mdash;</>;

                  if (exam.afterCompleteQuestionsHidden && exam.afterCompleteScoreHidden) {
                    return 'Questions and score hidden';
                  } else if (exam.afterCompleteQuestionsHidden) {
                    return 'Questions hidden';
                  } else {
                    return 'Questions and score visible';
                  }
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div className="access-summary-card-footer">
        <span>{formatListedForStudents(beforeReleaseListed)} before the exam</span>
        <span className="mx-1">·</span>
        <span>PrairieTest controls access and time limits during reservations</span>
      </div>
    </div>
  );
}

export function OverrideRuleSummaryCard({
  rule,
  title,
  onRemove,
  onEdit,
  displayTimezone,
  formErrors,
  dragHandleProps,
  isActive = false,
  canEdit = true,
}: {
  rule: OverrideData;
  title: string;
  onEdit?: () => void;
  displayTimezone: string;
  formErrors?: OverrideRuleFormErrors;
  onRemove?: () => void;
  dragHandleProps?: Record<string, unknown>;
  isActive?: boolean;
  canEdit?: boolean;
}) {
  const overrideFieldItems = generateOverrideFieldItems(rule, displayTimezone, formErrors);

  const studentLabels =
    rule.appliesTo.targetType === 'student_label' ? rule.appliesTo.studentLabels : [];

  return (
    <Card
      className={clsx('mb-3', isActive && 'border-primary border-2')}
      data-testid="override-card"
      aria-current={isActive ? 'true' : undefined}
    >
      <Card.Header className="d-flex flex-column flex-sm-row justify-content-between align-items-sm-center gap-2">
        <div className="d-flex align-items-center gap-2 flex-wrap">
          {dragHandleProps && (
            <button
              type="button"
              className="btn btn-sm btn-ghost p-0"
              style={{ cursor: 'grab', touchAction: 'none' }}
              aria-label="Drag to reorder"
              {...dragHandleProps}
            >
              <i className="bi bi-grip-vertical" aria-hidden="true" />
            </button>
          )}
          {studentLabels.length > 0 ? (
            <>
              {studentLabels.map((studentLabel) => (
                <StudentLabelBadge
                  key={studentLabel.studentLabelId || studentLabel.name}
                  label={{
                    name: studentLabel.name,
                    color: studentLabel.color ?? 'gray',
                  }}
                />
              ))}
            </>
          ) : (
            <strong>{title}</strong>
          )}
        </div>
        <div className="d-flex gap-2 flex-shrink-0">
          {onEdit && (
            <Button
              variant="outline-primary"
              size="sm"
              aria-label={canEdit ? 'Edit' : 'View'}
              className="d-inline-flex align-items-center"
              onClick={onEdit}
            >
              <i className={canEdit ? 'bi bi-pencil' : 'bi bi-eye'} aria-hidden="true" />
              <span className="toolbar-btn-label ms-1">{canEdit ? 'Edit' : 'View'}</span>
            </Button>
          )}
          {onRemove && (
            <Button
              variant="outline-danger"
              size="sm"
              aria-label="Remove"
              className="d-inline-flex align-items-center"
              onClick={onRemove}
            >
              <i className="bi bi-trash" aria-hidden="true" />
              <span className="toolbar-btn-label ms-1">Remove</span>
            </Button>
          )}
        </div>
      </Card.Header>
      <Card.Body>
        {overrideFieldItems.length > 0 && <OverrideFieldsList items={overrideFieldItems} />}

        {overrideFieldItems.length === 0 && (
          <p className="text-body-secondary mb-0">No specific settings configured</p>
        )}
      </Card.Body>
    </Card>
  );
}
