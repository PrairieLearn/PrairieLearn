import { Temporal } from '@js-temporal/polyfill';
import type { ReactNode } from 'react';
import { Button, Card } from 'react-bootstrap';

import { FriendlyDate } from '../../../components/FriendlyDate.js';
import { StudentLabelBadge } from '../../../components/StudentLabelBadge.js';

import {
  type AfterLastDeadlineValue,
  DATE_CONTROL_FIELD_NAMES,
  type DeadlineEntry,
  type MainRuleData,
  type OverrideData,
  isNonDefaultQuestionVisibility,
  isNonDefaultScoreVisibility,
} from './types.js';

type RuleData = MainRuleData | OverrideData;

function isMainRuleData(rule: RuleData): rule is MainRuleData {
  return 'dateControlEnabled' in rule;
}

function isOverrideFieldActive(rule: RuleData, fieldName: string): boolean {
  if (isMainRuleData(rule)) return true;
  return rule.overriddenFields.includes(fieldName);
}

interface DateTableRow {
  date: ReactNode;
  label: string;
  credit: string;
  visibility: string;
  error?: string;
}

/**
 * Maps field paths to their error messages for date-related fields.
 */
export interface DateFieldErrors {
  dueDate?: string;
  earlyDeadlines?: (string | undefined)[];
  lateDeadlines?: (string | undefined)[];
}

export function generateDateTableRows(
  rule: RuleData,
  displayTimezone: string,
  fieldErrors?: DateFieldErrors,
): DateTableRow[] {
  const rows: DateTableRow[] = [];

  // For main rule: check dateControlEnabled flag
  // For override: check if any date field is overridden
  const isMain = isMainRuleData(rule);
  const isDateControlEnabled = isMain
    ? rule.dateControlEnabled
    : DATE_CONTROL_FIELD_NAMES.some((f) => isOverrideFieldActive(rule, f));

  if (isDateControlEnabled) {
    const releaseDate = rule.releaseDate;
    const dueDate = rule.dueDate;
    const earlyDeadlines = rule.earlyDeadlines;
    const lateDeadlines = rule.lateDeadlines;

    // Build rows in logical order: release, early deadlines, due date, late deadlines.
    if (releaseDate) {
      const releasePlainDateTime = Temporal.PlainDateTime.from(releaseDate);
      const nowInTimezone = Temporal.Now.plainDateTimeISO(displayTimezone);

      if (Temporal.PlainDateTime.compare(releasePlainDateTime, nowInTimezone) > 0) {
        const visibility = isMain && rule.listBeforeRelease ? 'Closed (listed)' : 'Closed (hidden)';
        rows.push({
          date: '',
          label: 'Before release',
          credit: '—',
          visibility,
        });
      }

      rows.push({
        date: (
          <FriendlyDate
            date={releasePlainDateTime}
            timezone={displayTimezone}
            options={{ includeTz: false }}
            tooltip
          />
        ),
        label: 'Release',
        credit: '100%',
        visibility: 'Opens',
      });
    } else {
      rows.push({
        date: 'Released',
        label: '',
        credit: '100%',
        visibility: 'Opens',
      });
    }

    earlyDeadlines.forEach((deadline: DeadlineEntry, index: number) => {
      if (deadline.date) {
        rows.push({
          date: (
            <FriendlyDate
              date={Temporal.PlainDateTime.from(deadline.date)}
              timezone={displayTimezone}
              options={{ includeTz: false }}
              tooltip
            />
          ),
          label: `Early ${index + 1}`,
          credit: `${deadline.credit}%`,
          visibility: 'Open',
          error: fieldErrors?.earlyDeadlines?.[index],
        });
      }
    });

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
        credit: '100%',
        visibility: 'Closes',
        error: fieldErrors?.dueDate,
      });
    } else if (dueDate === null) {
      rows.push({
        date: 'No due date',
        label: 'Due',
        credit: '100%',
        visibility: 'Open',
      });
    }

    lateDeadlines.forEach((deadline: DeadlineEntry, index: number) => {
      if (deadline.date) {
        rows.push({
          date: (
            <FriendlyDate
              date={Temporal.PlainDateTime.from(deadline.date)}
              timezone={displayTimezone}
              options={{ includeTz: false }}
              tooltip
            />
          ),
          label: `Late ${index + 1}`,
          credit: `${deadline.credit}%`,
          visibility: 'Open',
          error: fieldErrors?.lateDeadlines?.[index],
        });
      }
    });
  }

  // Show "After last deadline" whenever there is any deadline configured.
  const afterLastDeadline = rule.afterLastDeadline;
  const hasAnyDeadline =
    isDateControlEnabled && (rule.dueDate || rule.lateDeadlines.some((d) => d.date));

  if (afterLastDeadline || hasAnyDeadline) {
    const visibility = afterLastDeadline?.allowSubmissions ? 'Open' : 'Closed';

    rows.push({
      date: '',
      label: 'After last deadline',
      credit: afterLastDeadline?.allowSubmissions ? `${afterLastDeadline.credit ?? 0}%` : '—',
      visibility,
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

export type SummaryItemErrors = Partial<Record<string, string>>;

export function generateRuleSummary(
  rule: RuleData,
  displayTimezone: string,
  itemErrors?: SummaryItemErrors,
): SummaryItem[] {
  const items: SummaryItem[] = [];

  if (isOverrideFieldActive(rule, 'durationMinutes')) {
    const durationMinutes = rule.durationMinutes;
    if (durationMinutes !== null) {
      items.push({
        key: 'duration',
        icon: 'bi-clock',
        text: `${durationMinutes} minutes`,
        error: itemErrors?.duration,
      });
    }
  }

  if (isOverrideFieldActive(rule, 'password')) {
    const password = rule.password;
    if (password !== null) {
      items.push({
        key: 'password',
        icon: 'bi-lock',
        text: 'Password protected',
        error: itemErrors?.password,
      });
    }
  }

  if (isMainRuleData(rule) && rule.prairieTestExams.length > 0) {
    items.push({
      key: 'prairietest',
      icon: 'bi-pc-display',
      text: `${rule.prairieTestExams.length} PrairieTest ${rule.prairieTestExams.length === 1 ? 'exam' : 'exams'}`,
      error: itemErrors?.prairietest,
    });
  }

  const isMain = isMainRuleData(rule);
  const hasDateControl = isMain ? rule.dateControlEnabled : false;
  const hasPrairieTest = isMain ? rule.prairieTestExams.length > 0 : false;
  const showAfterComplete = hasDateControl || hasPrairieTest;

  const qvNonDefault = isNonDefaultQuestionVisibility(rule.questionVisibility);
  const svNonDefault = isNonDefaultScoreVisibility(rule.scoreVisibility);

  if ((showAfterComplete || qvNonDefault) && isOverrideFieldActive(rule, 'questionVisibility')) {
    const qv = rule.questionVisibility;
    if (!qv.hideQuestions) {
      items.push({
        key: 'question-visibility',
        icon: 'bi-eye',
        text: 'Questions visible after completion',
        error: itemErrors?.['question-visibility'],
      });
    } else if (qv.showAgainDate && qv.hideAgainDate) {
      items.push({
        key: 'question-visibility',
        icon: 'bi-eye-slash',
        text: (
          <>
            Questions hidden after completion, shown{' '}
            <FriendlyDate
              date={Temporal.PlainDateTime.from(qv.showAgainDate)}
              timezone={displayTimezone}
              options={{ includeTz: false }}
              tooltip
            />
            {' – '}
            <FriendlyDate
              date={Temporal.PlainDateTime.from(qv.hideAgainDate)}
              timezone={displayTimezone}
              options={{ includeTz: false }}
              tooltip
            />
          </>
        ),
        error: itemErrors?.['question-visibility'],
      });
    } else if (qv.showAgainDate) {
      items.push({
        key: 'question-visibility',
        icon: 'bi-eye-slash',
        text: (
          <>
            Questions hidden after completion until{' '}
            <FriendlyDate
              date={Temporal.PlainDateTime.from(qv.showAgainDate)}
              timezone={displayTimezone}
              options={{ includeTz: false }}
              tooltip
            />
          </>
        ),
        error: itemErrors?.['question-visibility'],
      });
    } else {
      items.push({
        key: 'question-visibility',
        icon: 'bi-eye-slash',
        text: 'Questions hidden after completion',
        error: itemErrors?.['question-visibility'],
      });
    }
  }
  if ((showAfterComplete || svNonDefault) && isOverrideFieldActive(rule, 'scoreVisibility')) {
    const sv = rule.scoreVisibility;
    if (sv.hideScore && sv.showAgainDate) {
      items.push({
        key: 'score-visibility',
        icon: 'bi-eye-slash',
        text: (
          <>
            Score hidden after completion until{' '}
            <FriendlyDate
              date={Temporal.PlainDateTime.from(sv.showAgainDate)}
              timezone={displayTimezone}
              options={{ includeTz: false }}
              tooltip
            />
          </>
        ),
        error: itemErrors?.['score-visibility'],
      });
    } else if (sv.hideScore) {
      items.push({
        key: 'score-visibility',
        icon: 'bi-eye-slash',
        text: 'Score hidden after completion',
        error: itemErrors?.['score-visibility'],
      });
    } else {
      items.push({
        key: 'score-visibility',
        icon: 'bi-eye',
        text: 'Score visible after completion',
        error: itemErrors?.['score-visibility'],
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
  const filtered: { entry: DeadlineEntry; originalIndex: number }[] = [];
  deadlines.forEach((d, i) => {
    if (d.date) filtered.push({ entry: d, originalIndex: i });
  });
  return filtered.map(({ entry, originalIndex }, i) => ({
    label: filtered.length === 1 ? `${labelPrefix} deadline` : `${labelPrefix} deadline ${i + 1}`,
    value: (
      <>
        <FriendlyDate
          date={Temporal.PlainDateTime.from(entry.date)}
          timezone={displayTimezone}
          options={{ includeTz: false }}
          tooltip
        />{' '}
        ({entry.credit}% credit)
      </>
    ),
    error: deadlineErrors?.[originalIndex],
  }));
}

function formatAfterLastDeadline(afterLastDeadline: AfterLastDeadlineValue): string {
  const parts: string[] = [];
  if (afterLastDeadline.credit !== undefined) {
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
  fieldErrors?: DateFieldErrors,
  itemErrors?: SummaryItemErrors,
): OverrideFieldItem[] {
  const items: OverrideFieldItem[] = [];
  const overriddenFields = new Set(rule.overriddenFields);

  if (overriddenFields.has('releaseDate')) {
    // A null/empty release date means "not released" (resolver returns active: false).
    // TODO: enforce non-null release dates on overrides so this case goes away.
    items.push({
      label: 'Release date',
      value: rule.releaseDate ? (
        <FriendlyDate
          date={Temporal.PlainDateTime.from(rule.releaseDate)}
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
    const earlyItems = formatDeadlineEntries(
      rule.earlyDeadlines,
      displayTimezone,
      'Early',
      fieldErrors?.earlyDeadlines,
    );
    items.push(
      ...(earlyItems.length > 0 ? earlyItems : [{ label: 'Early deadlines', value: 'None' }]),
    );
  }

  if (overriddenFields.has('dueDate')) {
    items.push({
      label: 'Due date',
      value: rule.dueDate ? (
        <FriendlyDate
          date={Temporal.PlainDateTime.from(rule.dueDate)}
          timezone={displayTimezone}
          options={{ includeTz: false }}
          tooltip
        />
      ) : (
        'No due date'
      ),
      error: fieldErrors?.dueDate,
    });
  }

  if (overriddenFields.has('lateDeadlines')) {
    const lateItems = formatDeadlineEntries(
      rule.lateDeadlines,
      displayTimezone,
      'Late',
      fieldErrors?.lateDeadlines,
    );
    items.push(
      ...(lateItems.length > 0 ? lateItems : [{ label: 'Late deadlines', value: 'None' }]),
    );
  }

  if (overriddenFields.has('afterLastDeadline')) {
    items.push({
      label: 'After last deadline',
      value: rule.afterLastDeadline ? formatAfterLastDeadline(rule.afterLastDeadline) : 'None',
    });
  }

  if (overriddenFields.has('durationMinutes')) {
    items.push({
      label: 'Time limit',
      value: rule.durationMinutes !== null ? `${rule.durationMinutes} minutes` : 'No time limit',
    });
  }

  if (overriddenFields.has('password')) {
    items.push({
      label: 'Password',
      value: rule.password ? 'Password protected' : 'No password',
      error: itemErrors?.password,
    });
  }

  if (overriddenFields.has('questionVisibility')) {
    const qv = rule.questionVisibility;
    const qvError = itemErrors?.['question-visibility'];
    if (qv.hideQuestions) {
      if (qv.showAgainDate && qv.hideAgainDate) {
        items.push({
          label: 'Question visibility',
          value: (
            <>
              Hidden, shown again{' '}
              <FriendlyDate
                date={Temporal.PlainDateTime.from(qv.showAgainDate)}
                timezone={displayTimezone}
                options={{ includeTz: false }}
                tooltip
              />
              , hidden again{' '}
              <FriendlyDate
                date={Temporal.PlainDateTime.from(qv.hideAgainDate)}
                timezone={displayTimezone}
                options={{ includeTz: false }}
                tooltip
              />
            </>
          ),
          error: qvError,
        });
      } else if (qv.showAgainDate) {
        items.push({
          label: 'Question visibility',
          value: (
            <>
              Hidden, shown again{' '}
              <FriendlyDate
                date={Temporal.PlainDateTime.from(qv.showAgainDate)}
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
    const svError = itemErrors?.['score-visibility'];
    if (sv.hideScore) {
      if (sv.showAgainDate) {
        items.push({
          label: 'Score visibility',
          value: (
            <>
              Hidden, shown again{' '}
              <FriendlyDate
                date={Temporal.PlainDateTime.from(sv.showAgainDate)}
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
                borderLeft: item.error ? '3px solid var(--bs-danger)' : undefined,
                paddingLeft: item.error ? '0.5rem' : undefined,
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
  const numericValue = Number.parseInt(credit, 10);
  let className: string;

  if (Number.isNaN(numericValue)) {
    className = 'bg-body-tertiary text-body-secondary';
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
              <i className="bi bi-percent me-1" aria-hidden="true" />
              Credit
            </th>
            <th
              className="fw-semibold text-body-secondary text-nowrap border-bottom"
              style={thStyle}
            >
              <i className="bi bi-eye me-1" aria-hidden="true" />
              Access
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            // eslint-disable-next-line @eslint-react/no-array-index-key
            <tr key={index}>
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
              <td className="border-0" style={tdStyle}>
                {row.visibility}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
  fieldErrors,
  itemErrors,
  dragHandleProps,
}: {
  rule: OverrideData;
  title: string;
  onEdit?: () => void;
  displayTimezone: string;
  fieldErrors?: DateFieldErrors;
  itemErrors?: SummaryItemErrors;
  onRemove?: () => void;
  dragHandleProps?: Record<string, unknown>;
}) {
  const overrideFieldItems = generateOverrideFieldItems(rule, displayTimezone, fieldErrors, itemErrors);

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
