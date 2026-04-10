import { Temporal } from '@js-temporal/polyfill';
import type { ReactNode } from 'react';
import { Button, Card } from 'react-bootstrap';
import type { FieldErrors } from 'react-hook-form';

import { FriendlyDate } from '../../../components/FriendlyDate.js';
import { StudentLabelBadge } from '../../../components/StudentLabelBadge.js';

import {
  type AfterLastDeadlineValue,
  DATE_CONTROL_FIELD_NAMES,
  type DeadlineEntry,
  type MainRuleData,
  type OverridableFieldName,
  type OverrideData,
  isNonDefaultQuestionVisibility,
  isNonDefaultScoreVisibility,
} from './types.js';

type RuleData = MainRuleData | OverrideData;

/** react-hook-form error subtree for a single access control rule. */
export type RuleFormErrors = FieldErrors<MainRuleData> | FieldErrors<OverrideData>;

function isMainRuleData(rule: RuleData): rule is MainRuleData {
  return 'dateControlEnabled' in rule;
}

function isOverrideFieldActive(rule: RuleData, fieldName: OverridableFieldName): boolean {
  if (isMainRuleData(rule)) return true;
  return rule.overriddenFields.includes(fieldName);
}

interface DateTableRow {
  date: ReactNode;
  label: string;
  credit: string;
  error?: string;
}

export function generateDateTableRows(
  rule: RuleData,
  displayTimezone: string,
  formErrors?: RuleFormErrors,
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
    const afterLastDeadline = rule.afterLastDeadline;

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
      });
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
        error: formErrors?.dueDate?.message,
      });
    } else if (dueDate === null) {
      rows.push({
        date: 'No due date',
        label: 'Due',
        credit: '100%',
      });
    } else {
      // dueDate is an empty string — "Due on date" selected but no date entered
      rows.push({
        date: 'No date set',
        label: 'Due',
        credit: '100%',
        error: formErrors?.dueDate?.message,
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
      });
    });

    // Show "After last deadline" only when there is a deadline it can apply to.
    const hasAnyDeadline = rule.dueDate || rule.lateDeadlines.some((d) => d.date);

    if (hasAnyDeadline) {
      rows.push({
        date: '',
        label: 'After last deadline',
        credit: afterLastDeadline?.allowSubmissions ? `${afterLastDeadline.credit ?? 0}%` : '—',
        error: formErrors?.afterLastDeadline?.credit?.message,
      });
    }
  } else {
    // No date control — still show "After last deadline" if configured.
    const afterLastDeadline = rule.afterLastDeadline;
    const hasAnyDeadline = rule.dueDate || rule.lateDeadlines.some((d) => d.date);

    if (hasAnyDeadline) {
      rows.push({
        date: '',
        label: 'After last deadline',
        credit: afterLastDeadline?.allowSubmissions ? `${afterLastDeadline.credit ?? 0}%` : '—',
        error: formErrors?.afterLastDeadline?.credit?.message,
      });
    }
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

  // Show "before release" chip when release date is in the future.
  if (isMainRuleData(rule) && rule.dateControlEnabled && rule.releaseDate) {
    const releasePlainDateTime = Temporal.PlainDateTime.from(rule.releaseDate);
    const nowInTimezone = Temporal.Now.plainDateTimeISO(displayTimezone);

    if (Temporal.PlainDateTime.compare(releasePlainDateTime, nowInTimezone) > 0) {
      items.push({
        key: 'before-release',
        icon: rule.listBeforeRelease ? 'bi-eye' : 'bi-eye-slash',
        text: rule.listBeforeRelease ? 'Listed before release' : 'Hidden before release',
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

  if (isMainRuleData(rule) && rule.prairieTestExams.length > 0) {
    const mainErrors = formErrors as FieldErrors<MainRuleData> | undefined;
    const examErrors: string[] = [];
    for (let i = 0; i < rule.prairieTestExams.length; i++) {
      const msg = mainErrors?.prairieTestExams?.[i]?.examUuid?.message;
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

  const isMain = isMainRuleData(rule);
  const hasDateControl = isMain ? rule.dateControlEnabled : false;
  const hasPrairieTest = isMain ? rule.prairieTestExams.length > 0 : false;
  const showAfterComplete = hasDateControl || hasPrairieTest;

  const qvNonDefault = isNonDefaultQuestionVisibility(rule.questionVisibility);
  const svNonDefault = isNonDefaultScoreVisibility(rule.scoreVisibility);

  if ((showAfterComplete || qvNonDefault) && isOverrideFieldActive(rule, 'questionVisibility')) {
    const qv = rule.questionVisibility;
    const qvError =
      formErrors?.questionVisibility?.showAgainDate?.message ||
      formErrors?.questionVisibility?.hideAgainDate?.message ||
      formErrors?.questionVisibility?.message;
    if (!qv.hideQuestions) {
      items.push({
        key: 'question-visibility',
        icon: 'bi-eye',
        text: 'Questions visible after completion',
        error: qvError,
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
        error: qvError,
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
      formErrors?.scoreVisibility?.showAgainDate?.message || formErrors?.scoreVisibility?.message;
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
        error: svError,
      });
    } else if (sv.hideScore) {
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
  formErrors?: RuleFormErrors,
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
      error: formErrors?.dueDate?.message,
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
      value: rule.afterLastDeadline ? formatAfterLastDeadline(rule.afterLastDeadline) : 'None',
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
      formErrors?.questionVisibility?.showAgainDate?.message ||
      formErrors?.questionVisibility?.hideAgainDate?.message ||
      formErrors?.questionVisibility?.message;
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
    const svError =
      formErrors?.scoreVisibility?.showAgainDate?.message || formErrors?.scoreVisibility?.message;
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
