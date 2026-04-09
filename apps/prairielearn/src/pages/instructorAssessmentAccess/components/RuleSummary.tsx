import { Temporal } from '@js-temporal/polyfill';
import type { ReactNode } from 'react';
import { Button, Card } from 'react-bootstrap';
import type { FieldErrors } from 'react-hook-form';

import { FriendlyDate } from '../../../components/FriendlyDate.js';
import { StudentLabelBadge } from '../../../components/StudentLabelBadge.js';
import {
  type AccessDisplayModel,
  type AccessDisplaySource,
  formatAccessDisplayModel,
} from '../../../lib/assessment-access-control/access-display.js';

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

function dateToInstant(date: string, displayTimezone: string): Date {
  return new Date(
    Temporal.PlainDateTime.from(date).toZonedDateTime(displayTimezone).toInstant()
      .epochMilliseconds,
  );
}

function buildAccessDisplayModelForRule(
  rule: RuleData,
  displayTimezone: string,
): AccessDisplayModel {
  const rows: AccessDisplaySource['rows'] = [];
  const isMain = isMainRuleData(rule);
  const isDateControlEnabled = isMain
    ? rule.dateControlEnabled
    : DATE_CONTROL_FIELD_NAMES.some((field) => isOverrideFieldActive(rule, field));

  if (isDateControlEnabled) {
    if (isMain || isOverrideFieldActive(rule, 'releaseDate')) {
      if (rule.releaseDate) {
        rows.push({
          key: 'release',
          label: 'Release',
          date: dateToInstant(rule.releaseDate, displayTimezone),
          creditText: '100%',
          detailsText:
            isMain && rule.listBeforeRelease
              ? 'Assessment opens, Listed before release'
              : 'Assessment opens',
        });
      } else if (rule.releaseDate === null) {
        rows.push({
          key: 'release',
          label: 'Release',
          dateText: 'Not yet available',
          creditText: '100%',
          detailsText: 'No opening time configured',
        });
      }
    }

    if (isMain || isOverrideFieldActive(rule, 'earlyDeadlines')) {
      rule.earlyDeadlines.forEach((deadline: DeadlineEntry, index: number) => {
        if (!deadline.date) return;
        rows.push({
          key: `early-${index}`,
          label: `Early ${index + 1}`,
          date: dateToInstant(deadline.date, displayTimezone),
          creditText: `${deadline.credit}%`,
          detailsText: 'Open',
        });
      });
    }

    if (isMain || isOverrideFieldActive(rule, 'dueDate')) {
      if (rule.dueDate) {
        rows.push({
          key: 'due',
          label: 'Due',
          date: dateToInstant(rule.dueDate, displayTimezone),
          creditText: '100%',
          detailsText: 'Due',
        });
      } else if (rule.dueDate === null) {
        rows.push({
          key: 'due',
          label: 'Due',
          dateText: 'No due date',
          creditText: '100%',
          detailsText: 'Open',
        });
      }
    }

    if (isMain || isOverrideFieldActive(rule, 'lateDeadlines')) {
      rule.lateDeadlines.forEach((deadline: DeadlineEntry, index: number) => {
        if (!deadline.date) return;
        rows.push({
          key: `late-${index}`,
          label: `Late ${index + 1}`,
          date: dateToInstant(deadline.date, displayTimezone),
          creditText: `${deadline.credit}%`,
          detailsText: 'Open',
        });
      });
    }
  }

  if (rule.afterLastDeadline) {
    const details = [rule.afterLastDeadline.allowSubmissions ? 'Submissions allowed' : 'Closed'];
    if (
      isOverrideFieldActive(rule, 'questionVisibility') &&
      rule.questionVisibility.hideQuestions
    ) {
      details.push('Questions hidden');
    }
    if (isOverrideFieldActive(rule, 'scoreVisibility') && rule.scoreVisibility.hideScore) {
      details.push('Score hidden');
    }
    rows.push({
      key: 'after-last-deadline',
      label: null,
      dateText: 'After last deadline',
      creditText:
        rule.afterLastDeadline.credit !== undefined ? `${rule.afterLastDeadline.credit}%` : '0%',
      detailsText: details.join(', '),
    });
  }

  return formatAccessDisplayModel({
    displayTimezone,
    availability: { state: 'open', listed: true },
    includeAvailabilityBadge: false,
    rows,
    settings: {
      durationMinutes: isOverrideFieldActive(rule, 'durationMinutes') ? rule.durationMinutes : null,
      passwordRequired:
        isOverrideFieldActive(rule, 'password') && rule.password != null && rule.password !== '',
      prairieTestExamCount:
        isMain && rule.prairieTestEnabled ? rule.prairieTestExams.length : undefined,
      questionVisibility:
        !rule.afterLastDeadline && isOverrideFieldActive(rule, 'questionVisibility')
          ? {
              hideQuestions: rule.questionVisibility.hideQuestions,
              showAgainDate: rule.questionVisibility.showAgainDate
                ? dateToInstant(rule.questionVisibility.showAgainDate, displayTimezone)
                : null,
              hideAgainDate: rule.questionVisibility.hideAgainDate
                ? dateToInstant(rule.questionVisibility.hideAgainDate, displayTimezone)
                : null,
            }
          : undefined,
      scoreVisibility:
        !rule.afterLastDeadline && isOverrideFieldActive(rule, 'scoreVisibility')
          ? {
              hideScore: rule.scoreVisibility.hideScore,
              showAgainDate: rule.scoreVisibility.showAgainDate
                ? dateToInstant(rule.scoreVisibility.showAgainDate, displayTimezone)
                : null,
            }
          : undefined,
    },
  });
}

export function generateDateTableRows(rule: RuleData, displayTimezone: string): DateTableRow[] {
  return buildAccessDisplayModelForRule(rule, displayTimezone).rows.map((row) => ({
    date: row.dateIso ? (
      <FriendlyDate
        date={Temporal.Instant.from(row.dateIso)
          .toZonedDateTimeISO(displayTimezone)
          .toPlainDateTime()}
        timezone={displayTimezone}
        tooltip
      />
    ) : (
      row.dateText
    ),
    label: row.label ?? '',
    credit: row.creditText ?? '—',
    visibility: row.detailsText,
  }));
}

interface SummaryItem {
  key: string;
  icon: string;
  text: ReactNode;
  error?: string;
}

export function generateRuleSummary(rule: RuleData, displayTimezone: string): SummaryItem[] {
  return buildAccessDisplayModelForRule(rule, displayTimezone).badges.map((badge) => ({
    key: badge.key,
    icon: badge.icon ? `bi-${badge.icon}` : 'bi-info-circle',
    text: badge.label,
  }));
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
