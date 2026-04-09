import { Temporal } from '@js-temporal/polyfill';
import type { ReactNode } from 'react';
import { Alert, Button, Card } from 'react-bootstrap';

import { FriendlyDate } from '../../../components/FriendlyDate.js';
import { StudentLabelBadge } from '../../../components/StudentLabelBadge.js';

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

interface SummaryBadge {
  key: string;
  icon: string;
  text: ReactNode;
}

function FormDate({ date, timezone }: { date: string; timezone: string }) {
  return <FriendlyDate date={Temporal.PlainDateTime.from(date)} timezone={timezone} tooltip />;
}

export function buildRulePreview(
  rule: RuleData,
  displayTimezone: string,
): { rows: DateTableRow[]; badges: SummaryBadge[] } {
  const rows: DateTableRow[] = [];
  const badges: SummaryBadge[] = [];
  const isMain = isMainRuleData(rule);
  const isDateControlEnabled = isMain
    ? rule.dateControlEnabled
    : DATE_CONTROL_FIELD_NAMES.some((field) => isOverrideFieldActive(rule, field));

  let hasTimeline = false;

  if (isDateControlEnabled) {
    // Release
    if (isMain || isOverrideFieldActive(rule, 'releaseDate')) {
      if (rule.releaseDate) {
        rows.push({
          date: <FormDate date={rule.releaseDate} timezone={displayTimezone} />,
          label: 'Release',
          credit: '100%',
          visibility:
            isMain && rule.listBeforeRelease
              ? 'Assessment opens, Listed before release'
              : 'Assessment opens',
        });
      } else if (rule.releaseDate === null) {
        rows.push({
          date: 'Not yet available',
          label: 'Release',
          credit: '100%',
          visibility: 'No opening time configured',
        });
      }
    }

    // Early deadlines
    if (isMain || isOverrideFieldActive(rule, 'earlyDeadlines')) {
      rule.earlyDeadlines.forEach((d, i) => {
        if (d.date) {
          hasTimeline = true;
          rows.push({
            date: <FormDate date={d.date} timezone={displayTimezone} />,
            label: `Early ${i + 1}`,
            credit: `${d.credit}%`,
            visibility: 'Open',
          });
        }
      });
    }

    // Due date
    if (isMain || isOverrideFieldActive(rule, 'dueDate')) {
      if (rule.dueDate) {
        hasTimeline = true;
        rows.push({
          date: <FormDate date={rule.dueDate} timezone={displayTimezone} />,
          label: 'Due',
          credit: '100%',
          visibility: 'Due',
        });
      } else if (rule.dueDate === null) {
        rows.push({
          date: 'No due date',
          label: 'Due',
          credit: '100%',
          visibility: 'Open',
        });
      }
    }

    // Late deadlines
    if (isMain || isOverrideFieldActive(rule, 'lateDeadlines')) {
      rule.lateDeadlines.forEach((d, i) => {
        if (d.date) {
          hasTimeline = true;
          rows.push({
            date: <FormDate date={d.date} timezone={displayTimezone} />,
            label: `Late ${i + 1}`,
            credit: `${d.credit}%`,
            visibility: 'Open',
          });
        }
      });
    }
  }

  // After last deadline row
  const hasDueDateNull =
    (isMain || isOverrideFieldActive(rule, 'dueDate')) && rule.dueDate === null;
  if (hasTimeline || hasDueDateNull || rule.afterLastDeadline != null) {
    const ald = rule.afterLastDeadline;
    const details = [ald?.allowSubmissions ? 'Submissions allowed' : 'Closed'];
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
      date: 'After last deadline',
      label: '',
      credit: ald?.credit !== undefined ? `${ald.credit}%` : '0%',
      visibility: details.join(', '),
    });
  }

  // Badges
  if (isOverrideFieldActive(rule, 'durationMinutes') && rule.durationMinutes != null) {
    badges.push({
      key: 'duration',
      icon: 'bi-clock',
      text: `${rule.durationMinutes} minute${rule.durationMinutes === 1 ? '' : 's'} time limit`,
    });
  }

  if (isOverrideFieldActive(rule, 'password') && rule.password != null && rule.password !== '') {
    badges.push({
      key: 'password',
      icon: 'bi-lock',
      text: 'Password protected',
    });
  }

  if (isMain && rule.prairieTestExams.length > 0) {
    const count = rule.prairieTestExams.length;
    badges.push({
      key: 'prairietest',
      icon: 'bi-pc-display',
      text: `${count} PrairieTest ${count === 1 ? 'exam' : 'exams'}`,
    });
  }

  // Visibility badges (only when afterLastDeadline is not configured —
  // when it IS configured, visibility info appears in the row instead)
  if (!rule.afterLastDeadline) {
    if (isOverrideFieldActive(rule, 'questionVisibility')) {
      const qv = rule.questionVisibility;
      if (!qv.hideQuestions) {
        badges.push({
          key: 'question-visibility',
          icon: 'bi-eye',
          text: 'Questions visible after completion',
        });
      } else if (qv.showAgainDate && qv.hideAgainDate) {
        badges.push({
          key: 'question-visibility',
          icon: 'bi-eye-slash',
          text: (
            <>
              Questions hidden after completion, shown{' '}
              <FormDate date={qv.showAgainDate} timezone={displayTimezone} /> -{' '}
              <FormDate date={qv.hideAgainDate} timezone={displayTimezone} />
            </>
          ),
        });
      } else if (qv.showAgainDate) {
        badges.push({
          key: 'question-visibility',
          icon: 'bi-eye-slash',
          text: (
            <>
              Questions hidden after completion until{' '}
              <FormDate date={qv.showAgainDate} timezone={displayTimezone} />
            </>
          ),
        });
      }
    }

    if (isOverrideFieldActive(rule, 'scoreVisibility')) {
      const sv = rule.scoreVisibility;
      if (sv.hideScore && sv.showAgainDate) {
        badges.push({
          key: 'score-visibility',
          icon: 'bi-eye-slash',
          text: (
            <>
              Score hidden after completion until{' '}
              <FormDate date={sv.showAgainDate} timezone={displayTimezone} />
            </>
          ),
        });
      } else if (sv.hideScore) {
        badges.push({
          key: 'score-visibility',
          icon: 'bi-eye-slash',
          text: 'Score hidden after completion',
        });
      }
    }
  }

  return { rows, badges };
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
