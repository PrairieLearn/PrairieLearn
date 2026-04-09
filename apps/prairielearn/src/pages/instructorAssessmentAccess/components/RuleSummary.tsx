import { Temporal } from '@js-temporal/polyfill';
import type { ReactNode } from 'react';
import { Alert, Button, Card } from 'react-bootstrap';

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
} from './types.js';

type RuleData = MainRuleData | OverrideData;

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
  visibility: string;
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
        isMain && rule.prairieTestExams.length > 0 ? rule.prairieTestExams.length : undefined,
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
}

function formatDeadlineEntries(
  deadlines: DeadlineEntry[],
  displayTimezone: string,
  labelPrefix: string,
): OverrideFieldItem[] {
  const filtered = deadlines.filter((d) => d.date);
  return filtered.map((d, i) => ({
    label: filtered.length === 1 ? `${labelPrefix} deadline` : `${labelPrefix} deadline ${i + 1}`,
    value: (
      <>
        <FriendlyDate
          date={Temporal.PlainDateTime.from(d.date)}
          timezone={displayTimezone}
          tooltip
        />{' '}
        ({d.credit}% credit)
      </>
    ),
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
          tooltip
        />
      ) : (
        'Not released'
      ),
    });
  }

  if (overriddenFields.has('earlyDeadlines')) {
    const earlyItems = formatDeadlineEntries(rule.earlyDeadlines, displayTimezone, 'Early');
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
          tooltip
        />
      ) : (
        'No due date'
      ),
    });
  }

  if (overriddenFields.has('lateDeadlines')) {
    const lateItems = formatDeadlineEntries(rule.lateDeadlines, displayTimezone, 'Late');
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
    });
  }

  if (overriddenFields.has('questionVisibility')) {
    const qv = rule.questionVisibility;
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
                tooltip
              />
              , hidden again{' '}
              <FriendlyDate
                date={Temporal.PlainDateTime.from(qv.hideAgainDate)}
                timezone={displayTimezone}
                tooltip
              />
            </>
          ),
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
                tooltip
              />
            </>
          ),
        });
      } else {
        items.push({
          label: 'Question visibility',
          value: 'Questions hidden after completion',
        });
      }
    } else {
      items.push({
        label: 'Question visibility',
        value: 'Questions visible after completion',
      });
    }
  }

  if (overriddenFields.has('scoreVisibility')) {
    const sv = rule.scoreVisibility;
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
                tooltip
              />
            </>
          ),
        });
      } else {
        items.push({
          label: 'Score visibility',
          value: 'Score hidden after completion',
        });
      }
    } else {
      items.push({
        label: 'Score visibility',
        value: 'Score visible after completion',
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
              className="text-body-secondary fw-medium p-0 pe-3 pb-1"
              style={{ whiteSpace: 'nowrap', width: '1%' }}
            >
              {item.label}
            </td>
            <td className="p-0 pb-1">{item.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CreditBadge({ credit }: { credit: string }) {
  const numericValue = Number.parseInt(credit, 10);
  let className: string;

  if (numericValue === 100) {
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
              Visibility
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            // eslint-disable-next-line @eslint-react/no-array-index-key
            <tr key={index}>
              <td className="ps-3 border-0" style={tdStyle}>
                {row.label && <span className="text-body-secondary me-1">{row.label}:</span>}
                {row.date}
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
  errors,
  dragHandleProps,
}: {
  rule: OverrideData;
  title: string;
  onEdit?: () => void;
  displayTimezone: string;
  errors?: string[];
  onRemove?: () => void;
  dragHandleProps?: Record<string, unknown>;
}) {
  const overrideFieldItems = generateOverrideFieldItems(rule, displayTimezone);

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
        {errors && errors.length > 0 && (
          <Alert variant="danger" className="mb-3">
            <ul className="mb-0">
              {errors.map((msg) => (
                <li key={msg}>{msg}</li>
              ))}
            </ul>
          </Alert>
        )}

        {overrideFieldItems.length > 0 && <OverrideFieldsList items={overrideFieldItems} />}

        {overrideFieldItems.length === 0 && (
          <p className="text-body-secondary mb-0">No specific settings configured</p>
        )}
      </Card.Body>
    </Card>
  );
}
