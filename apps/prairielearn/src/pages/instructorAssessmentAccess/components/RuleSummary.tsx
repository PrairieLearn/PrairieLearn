import { Temporal } from '@js-temporal/polyfill';
import type { ReactNode } from 'react';
import { Button, Card } from 'react-bootstrap';
import type { FieldErrors } from 'react-hook-form';

import { FriendlyDate } from '../../../components/FriendlyDate.js';
import { StudentLabelBadge } from '../../../components/StudentLabelBadge.js';
import {
  type AccessTimelineEntry,
  type RuntimeDateControl,
  buildAccessTimeline,
} from '../../../lib/assessment-access-control/timeline.js';

import {
  type AfterLastDeadlineValue,
  type DeadlineEntry,
  type DefaultRuleData,
  type OverridableFieldName,
  type OverrideData,
  isNonDefaultQuestionVisibility,
  isNonDefaultScoreVisibility,
} from './types.js';

type RuleData = DefaultRuleData | OverrideData;

/** react-hook-form error subtree for a single access control rule. */
export type RuleFormErrors = FieldErrors<DefaultRuleData> | FieldErrors<OverrideData>;

function isDefaultRuleData(rule: RuleData): rule is DefaultRuleData {
  return 'dateControlEnabled' in rule;
}

function isOverrideFieldActive(rule: RuleData, fieldName: OverridableFieldName): boolean {
  if (isDefaultRuleData(rule)) return true;
  return rule.overriddenFields.includes(fieldName);
}

interface DateTableRow {
  date: ReactNode;
  label: string;
  credit: string;
  error?: string;
  current?: boolean;
}

/**
 * Convert a timezone-naive datetime-local string from the form into a Date,
 * interpreting it in the course instance's display timezone. Returns null
 * for empty or invalid input — the form may briefly hold partial values
 * during editing.
 */
function plainDateTimeStringToDate(
  value: string | null | undefined,
  timezone: string,
): Date | null {
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
 * `buildAccessTimeline`. Returns undefined when date control is disabled
 * or the release date is missing/invalid — both cases short-circuit the
 * timeline to no segments.
 */
function defaultRuleToRuntimeDateControl(
  rule: DefaultRuleData,
  displayTimezone: string,
): RuntimeDateControl | undefined {
  if (!rule.dateControlEnabled) return undefined;
  const releaseDate = plainDateTimeStringToDate(rule.release.date, displayTimezone);
  if (!releaseDate) return undefined;

  const toRuntimeDeadlines = (entries: DeadlineEntry[]) =>
    entries
      .map((e) => ({ date: plainDateTimeStringToDate(e.date, displayTimezone), credit: e.credit }))
      .filter((e): e is { date: Date; credit: number } => e.date !== null)
      .map((e) => ({ date: e.date.toISOString(), credit: e.credit }));

  const early = toRuntimeDeadlines(rule.earlyDeadlines);
  const late = toRuntimeDeadlines(rule.lateDeadlines);

  return {
    release: { date: releaseDate },
    // `due` is always part of dateControl when enabled (mirrors defaultRuleToJson).
    // null/empty due dates collapse to "no due date" for timeline purposes.
    due: {
      date: plainDateTimeStringToDate(rule.due.date, displayTimezone),
      ...(rule.due.customCredit && rule.due.credit != null ? { credit: rule.due.credit } : {}),
    },
    ...(early.length > 0 ? { earlyDeadlines: early } : {}),
    ...(late.length > 0 ? { lateDeadlines: late } : {}),
    ...(rule.afterLastDeadline ? { afterLastDeadline: rule.afterLastDeadline } : {}),
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
  formErrors?: RuleFormErrors,
): DateTableRow[] {
  if (!rule.dateControlEnabled) return [];

  const rows: DateTableRow[] = [];

  const releaseDate = rule.release.date;
  const dueDate = rule.due.date;
  const dueCredit = rule.due.credit ?? 100;
  const earlyDeadlines = rule.earlyDeadlines;
  const lateDeadlines = rule.lateDeadlines;

  // Build rows in logical order: release, early deadlines, due date, late deadlines.
  const afterLastDeadline = rule.afterLastDeadline;

  const { rdc, segment } = getDefaultRuleCurrentState(rule, displayTimezone);
  const segmentEndsAt = segment?.endDate?.getTime() ?? null;
  const isBeforeReleaseSegment = segment?.startDate === null;
  // The trailing segment (endDate === null) is either the indefinite-due
  // segment (when due.date is null) or the after-last-deadline segment. Only
  // claim it for the After-last row when due has an actual date — otherwise
  // it belongs to the "No due date" row.
  const isAfterLastSegment =
    segment?.endDate === null &&
    segment.startDate !== null &&
    rdc?.release != null &&
    segment.startDate.getTime() !== rdc.release.date.getTime() &&
    Boolean(dueDate);
  // Indefinite-due segment is the trailing segment when due.date is null.
  const isIndefiniteDueSegment = segment?.endDate === null && dueDate === null;

  const isDeadlineCurrent = (formDateString: string): boolean => {
    if (segmentEndsAt == null) return false;
    const d = plainDateTimeStringToDate(formDateString, displayTimezone);
    return d?.getTime() === segmentEndsAt;
  };

  if (releaseDate) {
    rows.push({
      date: (
        <FriendlyDate
          date={Temporal.PlainDateTime.from(releaseDate)}
          timezone={displayTimezone}
          options={{ includeTz: false }}
          tooltip
        />
      ),
      label: 'Release',
      credit: '—',
      current: isBeforeReleaseSegment,
    });
  }

  earlyDeadlines.forEach((deadline: DeadlineEntry, index: number) => {
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
      credit: `${deadline.credit}%`,
      error: [dateErr, creditErr].filter(Boolean).join('; ') || undefined,
      current: deadline.date ? isDeadlineCurrent(deadline.date) : false,
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
      credit: `${dueCredit}%`,
      error: dueError,
      current: isDeadlineCurrent(dueDate),
    });
  } else if (dueDate === null) {
    rows.push({
      date: 'No due date',
      label: 'Due',
      credit: `${dueCredit}%`,
      error: dueError,
      current: isIndefiniteDueSegment,
    });
  } else {
    // dueDate is an empty string — "Due on date" selected but no date entered
    rows.push({
      date: 'No date set',
      label: 'Due',
      credit: `${dueCredit}%`,
      error: dueError,
    });
  }

  lateDeadlines.forEach((deadline: DeadlineEntry, index: number) => {
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
      credit: `${deadline.credit}%`,
      error: [dateErr, creditErr].filter(Boolean).join('; ') || undefined,
      current: deadline.date ? isDeadlineCurrent(deadline.date) : false,
    });
  });

  // Show "After last deadline" only when there is a deadline it can apply to.
  const hasAnyDeadline = rule.due.date || rule.lateDeadlines.some((d) => d.date);

  if (hasAnyDeadline) {
    rows.push({
      date: '',
      label: 'After last deadline',
      credit: afterLastDeadline?.allowSubmissions
        ? afterLastDeadline.credit != null
          ? `${afterLastDeadline.credit}%`
          : 'Practice'
        : 'Closed',
      error: formErrors?.afterLastDeadline?.credit?.message,
      current: isAfterLastSegment,
    });
  }

  return rows;
}

interface SummaryItem {
  key: string;
  icon: string;
  text: ReactNode;
  error?: string;
}

export function generateRuleSummary(
  rule: RuleData,
  displayTimezone: string,
  formErrors?: RuleFormErrors,
): SummaryItem[] {
  const items: SummaryItem[] = [];

  // Show a chip only when the student will see the assessment listed before
  // they have access. Mirrors the resolver's `showBeforeRelease` logic: the
  // listing happens when `beforeReleaseListed` is set AND either the release
  // date is in the future or no release date is configured at all (perpetual
  // "coming soon" until dates are added or PrairieTest grants access).
  if (isDefaultRuleData(rule) && rule.beforeReleaseListed) {
    const releaseDate = rule.dateControlEnabled ? rule.release.date : null;
    const releaseInFuture = releaseDate
      ? Temporal.PlainDateTime.compare(
          Temporal.PlainDateTime.from(releaseDate),
          Temporal.Now.plainDateTimeISO(displayTimezone),
        ) > 0
      : null;

    if (releaseInFuture !== false) {
      items.push({
        key: 'before-release',
        icon: 'bi-eye',
        text: releaseInFuture ? 'Listed before release' : 'Always listed',
      });
    }
  }

  if (isOverrideFieldActive(rule, 'durationMinutes')) {
    const durationMinutes = rule.durationMinutes;
    if (durationMinutes !== null) {
      const error = formErrors?.durationMinutes?.message;
      items.push({
        key: 'duration',
        icon: 'bi-clock',
        text: error ? 'Missing time limit' : `${durationMinutes} minutes`,
        error,
      });
    }
  }

  if (isOverrideFieldActive(rule, 'password')) {
    const password = rule.password;
    if (password !== null) {
      const error = formErrors?.password?.message;
      items.push({
        key: 'password',
        icon: 'bi-lock',
        text: error ? 'Missing password' : 'Password protected',
        error,
      });
    }
  }

  if (isDefaultRuleData(rule) && rule.prairieTestExams.length > 0) {
    const defaultRuleErrors = formErrors as FieldErrors<DefaultRuleData> | undefined;
    const examErrors: string[] = [];
    for (let i = 0; i < rule.prairieTestExams.length; i++) {
      const msg = defaultRuleErrors?.prairieTestExams?.[i]?.examUuid?.message;
      if (msg) examErrors.push(`Exam ${i + 1}: ${msg}`);
    }
    const error = examErrors.length > 0 ? examErrors.join('; ') : undefined;
    items.push({
      key: 'prairietest',
      icon: 'bi-pc-display',
      text: error
        ? 'Missing PrairieTest exam UUID'
        : `${rule.prairieTestExams.length} PrairieTest ${rule.prairieTestExams.length === 1 ? 'exam' : 'exams'}`,
      error,
    });
  }

  const isDefault = isDefaultRuleData(rule);
  const hasDateControl = isDefault ? rule.dateControlEnabled : false;
  const hasPrairieTest = isDefault ? rule.prairieTestExams.length > 0 : false;
  const showAfterComplete = hasDateControl || hasPrairieTest;

  const qvNonDefault = isNonDefaultQuestionVisibility(rule.questionVisibility);
  const svNonDefault = isNonDefaultScoreVisibility(rule.scoreVisibility);

  if ((showAfterComplete || qvNonDefault) && isOverrideFieldActive(rule, 'questionVisibility')) {
    const qv = rule.questionVisibility;
    const qvError =
      formErrors?.questionVisibility?.visibleFromDate?.message ||
      formErrors?.questionVisibility?.visibleUntilDate?.message ||
      formErrors?.questionVisibility?.message;
    if (!qv.hidden) {
      items.push({
        key: 'question-visibility',
        icon: 'bi-eye',
        text: 'Questions visible after completion',
        error: qvError,
      });
    } else if (qv.visibleFromDate && qv.visibleUntilDate) {
      items.push({
        key: 'question-visibility',
        icon: 'bi-eye-slash',
        text: (
          <>
            Questions hidden after completion, shown{' '}
            <FriendlyDate
              date={Temporal.PlainDateTime.from(qv.visibleFromDate)}
              timezone={displayTimezone}
              options={{ includeTz: false }}
              tooltip
            />
            {' – '}
            <FriendlyDate
              date={Temporal.PlainDateTime.from(qv.visibleUntilDate)}
              timezone={displayTimezone}
              options={{ includeTz: false }}
              tooltip
            />
          </>
        ),
        error: qvError,
      });
    } else if (qv.visibleFromDate) {
      items.push({
        key: 'question-visibility',
        icon: 'bi-eye-slash',
        text: (
          <>
            Questions hidden after completion until{' '}
            <FriendlyDate
              date={Temporal.PlainDateTime.from(qv.visibleFromDate)}
              timezone={displayTimezone}
              options={{ includeTz: false }}
              tooltip
            />
          </>
        ),
        error: qvError,
      });
    } else {
      items.push({
        key: 'question-visibility',
        icon: 'bi-eye-slash',
        text: 'Questions hidden after completion',
        error: qvError,
      });
    }
  }
  if ((showAfterComplete || svNonDefault) && isOverrideFieldActive(rule, 'scoreVisibility')) {
    const sv = rule.scoreVisibility;
    const svError =
      formErrors?.scoreVisibility?.visibleFromDate?.message || formErrors?.scoreVisibility?.message;
    if (sv.hidden && sv.visibleFromDate) {
      items.push({
        key: 'score-visibility',
        icon: 'bi-eye-slash',
        text: (
          <>
            Score hidden after completion until{' '}
            <FriendlyDate
              date={Temporal.PlainDateTime.from(sv.visibleFromDate)}
              timezone={displayTimezone}
              options={{ includeTz: false }}
              tooltip
            />
          </>
        ),
        error: svError,
      });
    } else if (sv.hidden) {
      items.push({
        key: 'score-visibility',
        icon: 'bi-eye-slash',
        text: 'Score hidden after completion',
        error: svError,
      });
    } else {
      items.push({
        key: 'score-visibility',
        icon: 'bi-eye',
        text: 'Score visible after completion',
        error: svError,
      });
    }
  }

  return items;
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
        ({entry.credit}% credit)
      </>
    ) : (
      `No date set (${entry.credit}% credit)`
    ),
    error: deadlineErrors?.[i],
  }));
}

function formatAfterLastDeadline(afterLastDeadline: AfterLastDeadlineValue): string {
  const parts: string[] = [];
  if (afterLastDeadline.allowSubmissions && afterLastDeadline.credit != null) {
    parts.push(`${afterLastDeadline.credit}% credit`);
  }
  if (afterLastDeadline.allowSubmissions) {
    parts.push('submissions allowed');
  } else {
    parts.push('closed');
  }
  return parts.join(', ');
}

function generateOverrideFieldItems(
  rule: OverrideData,
  displayTimezone: string,
  formErrors?: RuleFormErrors,
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
    const creditLabel = rule.due.credit != null ? ` (${rule.due.credit}%)` : '';
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
      error: formErrors?.afterLastDeadline?.credit?.message,
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
      value: rule.password ? 'Password protected' : 'No password',
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
      if (qv.visibleFromDate && qv.visibleUntilDate) {
        items.push({
          label: 'Question visibility',
          value: (
            <>
              Hidden, shown again{' '}
              <FriendlyDate
                date={Temporal.PlainDateTime.from(qv.visibleFromDate)}
                timezone={displayTimezone}
                options={{ includeTz: false }}
                tooltip
              />
              , hidden again{' '}
              <FriendlyDate
                date={Temporal.PlainDateTime.from(qv.visibleUntilDate)}
                timezone={displayTimezone}
                options={{ includeTz: false }}
                tooltip
              />
            </>
          ),
          error: qvError,
        });
      } else if (qv.visibleFromDate) {
        items.push({
          label: 'Question visibility',
          value: (
            <>
              Hidden, shown again{' '}
              <FriendlyDate
                date={Temporal.PlainDateTime.from(qv.visibleFromDate)}
                timezone={displayTimezone}
                options={{ includeTz: false }}
                tooltip
              />
            </>
          ),
          error: qvError,
        });
      } else {
        items.push({
          label: 'Question visibility',
          value: 'Questions hidden after completion',
          error: qvError,
        });
      }
    } else {
      items.push({
        label: 'Question visibility',
        value: 'Questions visible after completion',
        error: qvError,
      });
    }
  }

  if (overriddenFields.has('scoreVisibility')) {
    const sv = rule.scoreVisibility;
    const svError =
      formErrors?.scoreVisibility?.visibleFromDate?.message || formErrors?.scoreVisibility?.message;
    if (sv.hidden) {
      if (sv.visibleFromDate) {
        items.push({
          label: 'Score visibility',
          value: (
            <>
              Hidden, shown again{' '}
              <FriendlyDate
                date={Temporal.PlainDateTime.from(sv.visibleFromDate)}
                timezone={displayTimezone}
                options={{ includeTz: false }}
                tooltip
              />
            </>
          ),
          error: svError,
        });
      } else {
        items.push({
          label: 'Score visibility',
          value: 'Score hidden after completion',
          error: svError,
        });
      }
    } else {
      items.push({
        label: 'Score visibility',
        value: 'Score visible after completion',
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
  let className: string;

  if (Number.isNaN(numericValue)) {
    className = 'bg-body-tertiary text-body-secondary';
  } else if (numericValue > 100) {
    className = 'bg-info-subtle text-info-emphasis';
  } else if (numericValue === 100) {
    className = 'bg-success-subtle text-success-emphasis';
  } else if (numericValue === 0) {
    className = 'bg-danger-subtle text-danger-emphasis';
  } else {
    className = 'bg-warning-subtle text-warning-emphasis';
  }

  return <span className={`badge rounded-pill fw-medium ${className}`}>{credit}</span>;
}

export function DateTableView({ rows }: { rows: DateTableRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div
      className="border rounded overflow-hidden"
      style={{ borderColor: 'var(--bs-border-color)' }}
    >
      <table className="table table-sm mb-0">
        <thead>
          <tr>
            <th
              className="fw-semibold text-body-secondary text-nowrap border-bottom ps-3"
              style={thStyle}
            >
              <i className="bi bi-calendar3 me-1" aria-hidden="true" />
              Date
            </th>
            <th
              className="fw-semibold text-body-secondary text-nowrap border-bottom"
              style={thStyle}
            >
              Credit
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            // eslint-disable-next-line @eslint-react/no-array-index-key
            <tr key={index} className={row.current ? 'table-active' : undefined}>
              <td
                className="border-0"
                style={{
                  ...tdStyle,
                  paddingLeft: '1rem',
                }}
              >
                <div className="text-nowrap">
                  {row.label && (
                    <span className={`me-1 ${row.error ? 'text-danger' : 'text-body-secondary'}`}>
                      {row.label}
                      {row.date ? ':' : ''}
                    </span>
                  )}
                  {row.error ? <span className="text-danger">{row.date}</span> : row.date}
                  {row.current && (
                    <span className="badge bg-primary-subtle text-primary-emphasis ms-2 fw-medium">
                      Now
                    </span>
                  )}
                </div>
                {row.error && (
                  <div className="text-danger small">
                    <i className="bi bi-exclamation-circle me-1" aria-hidden="true" />
                    {row.error}
                  </div>
                )}
              </td>
              <td className="border-0" style={tdStyle}>
                <CreditBadge credit={row.credit} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface NowIndicator {
  variant: 'success' | 'warning' | 'secondary' | 'danger';
  icon: string;
  text: ReactNode;
}

function buildDefaultRuleNowIndicator(
  rule: DefaultRuleData,
  displayTimezone: string,
): NowIndicator | null {
  const { rdc, segment } = getDefaultRuleCurrentState(rule, displayTimezone);

  // Mirrors the resolver's `showBeforeRelease`: students see a "coming soon"
  // listing when `beforeReleaseListed` is set and either no release date is
  // configured OR the current time is before the release.
  const listedBeforeRelease = rule.beforeReleaseListed && (!rdc || segment?.startDate === null);

  if (!segment) {
    if (listedBeforeRelease) {
      return {
        variant: 'warning',
        icon: 'bi-eye',
        text: 'Listed but not accessible',
      };
    }
    return null;
  }

  const friendlyDate = (date: Date) => (
    <FriendlyDate date={date} timezone={displayTimezone} options={{ includeTz: false }} tooltip />
  );

  if (segment.startDate === null) {
    const opensAt = segment.endDate;
    if (listedBeforeRelease) {
      return {
        variant: 'warning',
        icon: 'bi-eye',
        text: opensAt ? (
          <>Listed but not accessible · opens {friendlyDate(opensAt)}</>
        ) : (
          'Listed but not accessible'
        ),
      };
    }
    return {
      variant: 'secondary',
      icon: 'bi-eye-slash',
      text: opensAt ? <>Hidden · opens {friendlyDate(opensAt)}</> : 'Hidden',
    };
  }

  if (!segment.submittable) {
    return { variant: 'danger', icon: 'bi-lock', text: 'Closed' };
  }

  if (segment.endDate) {
    return {
      variant: 'success',
      icon: 'bi-unlock',
      text: (
        <>
          Open · {segment.credit}% credit until {friendlyDate(segment.endDate)}
        </>
      ),
    };
  }
  return {
    variant: 'success',
    icon: 'bi-unlock',
    text: `Open · ${segment.credit}% credit`,
  };
}

export function DefaultRuleNowIndicator({
  rule,
  displayTimezone,
}: {
  rule: DefaultRuleData;
  displayTimezone: string;
}) {
  const indicator = buildDefaultRuleNowIndicator(rule, displayTimezone);
  if (!indicator) return null;
  return (
    <div
      className={`d-flex align-items-center gap-2 px-3 py-2 rounded mb-2 bg-${indicator.variant}-subtle text-${indicator.variant}-emphasis`}
      role="status"
    >
      <i className={`bi ${indicator.icon}`} aria-hidden="true" />
      <span>
        <strong>Now:</strong> {indicator.text}
      </span>
    </div>
  );
}

const thStyle = {
  fontSize: '0.75rem',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.05em',
  paddingTop: '0.5rem',
  paddingBottom: '0.5rem',
};

const tdStyle = {
  paddingTop: '0.5rem',
  paddingBottom: '0.5rem',
};

export function OverrideRuleSummaryCard({
  rule,
  title,
  onRemove,
  onEdit,
  displayTimezone,
  formErrors,
  dragHandleProps,
}: {
  rule: OverrideData;
  title: string;
  onEdit?: () => void;
  displayTimezone: string;
  formErrors?: RuleFormErrors;
  onRemove?: () => void;
  dragHandleProps?: Record<string, unknown>;
}) {
  const overrideFieldItems = generateOverrideFieldItems(rule, displayTimezone, formErrors);

  const studentLabels =
    rule.appliesTo.targetType === 'student_label' ? rule.appliesTo.studentLabels : [];

  return (
    <Card className="mb-3" data-testid="override-card">
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
            <Button variant="outline-primary" size="sm" aria-label="Edit" onClick={onEdit}>
              <i className="bi bi-pencil" aria-hidden="true" />
              <span className="toolbar-btn-label ms-1">Edit</span>
            </Button>
          )}
          {onRemove && (
            <Button variant="outline-danger" size="sm" aria-label="Remove" onClick={onRemove}>
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
