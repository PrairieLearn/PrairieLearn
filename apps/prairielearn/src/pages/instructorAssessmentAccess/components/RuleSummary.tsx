import { Alert, Button, Card } from 'react-bootstrap';

import { formatDate } from '@prairielearn/formatter';

import { StudentLabelBadge } from '../../../components/StudentLabelBadge.js';
import { getStudentEnrollmentUrl } from '../../../lib/client/url.js';

import {
  DATE_CONTROL_FIELD_NAMES,
  type DeadlineEntry,
  type MainRuleData,
  type OverrideData,
} from './types.js';

type RuleData = MainRuleData | OverrideData;
type SummaryVerbosity = 'compact' | 'verbose';

function isMainRuleData(rule: RuleData): rule is MainRuleData {
  return 'dateControlEnabled' in rule;
}

function isOverrideFieldActive(rule: RuleData, fieldName: string): boolean {
  if (isMainRuleData(rule)) return true;
  return rule.overriddenFields.includes(fieldName);
}

interface DateTableRow {
  date: string;
  label: string;
  credit: string;
  visibility: string;
}

export function generateDateTableRows(
  rule: RuleData,
  displayTimezone: string,
  verbosity: SummaryVerbosity = 'compact',
): DateTableRow[] {
  const rows: DateTableRow[] = [];

  // For main rule: check dateControlEnabled flag
  // For override: check if any date field is overridden
  const isMain = isMainRuleData(rule);
  const isDateControlEnabled = isMain
    ? rule.dateControlEnabled
    : DATE_CONTROL_FIELD_NAMES.some((f) => isOverrideFieldActive(rule, f));

  if (isDateControlEnabled) {
    const entries: (DateTableRow & { timestamp: number })[] = [];

    const releaseDate = rule.releaseDate;
    const dueDate = rule.dueDate;
    const earlyDeadlines = rule.earlyDeadlines;
    const lateDeadlines = rule.lateDeadlines;

    if (releaseDate) {
      const visibilityParts: string[] = ['Assessment opens'];
      if (isMain && rule.listBeforeRelease) {
        visibilityParts.push('(listed before release)');
      }
      entries.push({
        date: releaseDate,
        timestamp: new Date(releaseDate).getTime(),
        label: 'Release',
        credit: '100%',
        visibility: visibilityParts.join(' '),
      });
    } else if (releaseDate === null && verbosity === 'verbose') {
      rows.push({
        date: 'Released immediately',
        label: '',
        credit: '100%',
        visibility: 'Assessment opens',
      });
    }

    earlyDeadlines.forEach((deadline: DeadlineEntry, index: number) => {
      if (deadline.date) {
        entries.push({
          date: deadline.date,
          timestamp: new Date(deadline.date).getTime(),
          label: `Early ${index + 1}`,
          credit: `${deadline.credit}%`,
          visibility: 'Open',
        });
      }
    });

    if (dueDate) {
      entries.push({
        date: dueDate,
        timestamp: new Date(dueDate).getTime(),
        label: 'Due',
        credit: '100%',
        visibility: 'Due',
      });
    } else if (dueDate === null && verbosity === 'verbose') {
      rows.push({
        date: 'No due date',
        label: '',
        credit: '100%',
        visibility: 'Open',
      });
    }

    lateDeadlines.forEach((deadline: DeadlineEntry, index: number) => {
      if (deadline.date) {
        entries.push({
          date: deadline.date,
          timestamp: new Date(deadline.date).getTime(),
          label: `Late ${index + 1}`,
          credit: `${deadline.credit}%`,
          visibility: 'Open',
        });
      }
    });

    entries.sort((a, b) => a.timestamp - b.timestamp);

    for (const entry of entries) {
      rows.push({
        date: formatDate(new Date(entry.date), displayTimezone),
        label: entry.label,
        credit: entry.credit,
        visibility: entry.visibility,
      });
    }
  }

  // afterLastDeadline is shown regardless of dateControlEnabled since it can
  // be configured independently of date-based access control.
  const afterLastDeadline = rule.afterLastDeadline;
  if (afterLastDeadline) {
    const visibilityParts: string[] = [];

    if (afterLastDeadline.allowSubmissions) {
      visibilityParts.push('Submissions allowed');
    } else {
      visibilityParts.push('Closed');
    }

    const qv = rule.questionVisibility;
    if (qv.hideQuestions) {
      visibilityParts.push('Questions hidden');
    }
    const sv = rule.scoreVisibility;
    if (sv.hideScore) {
      visibilityParts.push('Score hidden');
    }

    rows.push({
      date: 'After last deadline',
      label: '',
      credit: afterLastDeadline.credit !== undefined ? `${afterLastDeadline.credit}%` : '0%',
      visibility: visibilityParts.join(', '),
    });
  }

  return rows;
}

interface SummaryItem {
  icon: string;
  text: string;
}

export function generateRuleSummary(
  rule: RuleData,
  verbosity: SummaryVerbosity = 'compact',
): SummaryItem[] {
  const items: SummaryItem[] = [];

  if (isOverrideFieldActive(rule, 'durationMinutes')) {
    const durationMinutes = rule.durationMinutes;
    if (durationMinutes !== null) {
      items.push({ icon: 'bi-clock', text: `${durationMinutes} minutes` });
    } else if (verbosity === 'verbose') {
      items.push({ icon: 'bi-clock', text: 'No time limit' });
    }
  }

  if (isOverrideFieldActive(rule, 'password')) {
    const password = rule.password;
    if (password !== null && password !== '') {
      items.push({ icon: 'bi-lock', text: 'Password protected' });
    } else if (verbosity === 'verbose') {
      items.push({ icon: 'bi-unlock', text: 'No password' });
    }
  }

  if (isMainRuleData(rule) && rule.prairieTestEnabled && rule.prairieTestExams.length > 0) {
    items.push({
      icon: 'bi-pc-display',
      text: `${rule.prairieTestExams.length} PrairieTest ${rule.prairieTestExams.length === 1 ? 'exam' : 'exams'}`,
    });
  }

  const hasAfterLastDeadline = rule.afterLastDeadline != null;

  if (!hasAfterLastDeadline) {
    if (isOverrideFieldActive(rule, 'questionVisibility')) {
      const qv = rule.questionVisibility;
      if (qv.hideQuestions) {
        items.push({ icon: 'bi-eye-slash', text: 'Questions hidden after completion' });
      } else if (verbosity === 'verbose') {
        items.push({ icon: 'bi-eye', text: 'Questions visible after completion' });
      }
    }
    if (isOverrideFieldActive(rule, 'scoreVisibility')) {
      const sv = rule.scoreVisibility;
      if (sv.hideScore) {
        items.push({ icon: 'bi-eye-slash', text: 'Score hidden after completion' });
      } else if (verbosity === 'verbose') {
        items.push({ icon: 'bi-eye', text: 'Score visible after completion' });
      }
    }
  }

  return items;
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
            <th className="fw-semibold text-body-secondary border-bottom ps-3" style={thStyle}>
              <i className="bi bi-calendar3 me-1" aria-hidden="true" />
              Date
            </th>
            <th className="fw-semibold text-body-secondary border-bottom" style={thStyle}>
              <i className="bi bi-percent me-1" aria-hidden="true" />
              Credit
            </th>
            <th className="fw-semibold text-body-secondary border-bottom" style={thStyle}>
              <i className="bi bi-eye me-1" aria-hidden="true" />
              Visibility
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.date}-${row.label}-${row.credit}-${row.visibility}`}>
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

export function RuleSummaryCard({
  rule,
  isMainRule,
  title,
  onRemove,
  editUrl,
  onEdit,
  courseInstanceId,
  displayTimezone,
  errors,
  onEditStudentLabels,
  dragHandleProps,
}: {
  rule: RuleData;
  isMainRule: boolean;
  title: string;
  editUrl?: string;
  onEdit?: () => void;
  courseInstanceId: string;
  displayTimezone: string;
  errors?: string[];
  onEditStudentLabels?: () => void;
  onRemove?: () => void;
  dragHandleProps?: Record<string, unknown>;
}) {
  const effectiveVerbosity: SummaryVerbosity = isMainRule ? 'compact' : 'verbose';
  const summaryItems = generateRuleSummary(rule, effectiveVerbosity);
  const dateTableRows = generateDateTableRows(rule, displayTimezone, effectiveVerbosity);

  const overrideRule = !isMainRule ? (rule as OverrideData) : null;

  const students =
    overrideRule?.appliesTo.targetType === 'individual' ? overrideRule.appliesTo.individuals : [];

  const studentLabels =
    overrideRule?.appliesTo.targetType === 'student_label'
      ? overrideRule.appliesTo.studentLabels
      : [];

  return (
    <Card className="mb-3" data-testid={isMainRule ? undefined : 'override-card'}>
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
            <>
              {overrideRule && (
                <span className="d-inline-flex align-items-center gap-1 text-body-secondary small">
                  <i className="bi bi-person" aria-hidden="true" />
                </span>
              )}
              <strong>{title}</strong>
            </>
          )}
        </div>
        <div className="d-flex gap-2 flex-shrink-0">
          {onEditStudentLabels && (
            <Button variant="outline-secondary" size="sm" onClick={onEditStudentLabels}>
              <i className="bi bi-people me-1" /> Student labels
            </Button>
          )}
          {onEdit ? (
            <Button variant="outline-primary" size="sm" onClick={onEdit}>
              <i className="bi bi-pencil me-1" /> Edit
            </Button>
          ) : editUrl ? (
            <a href={editUrl} className="btn btn-outline-primary btn-sm">
              <i className="bi bi-pencil me-1" /> Edit
            </a>
          ) : null}
          {onRemove && (
            <Button variant="outline-danger" size="sm" onClick={onRemove}>
              <i className="bi bi-trash me-1" /> Remove
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

        {dateTableRows.length > 0 && (
          <div className="mb-2">
            <div
              className="text-body-secondary fw-semibold mb-2"
              style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}
            >
              Deadlines
            </div>
            <DateTableView rows={dateTableRows} />
          </div>
        )}

        {summaryItems.length > 0 && (
          <div className="d-flex flex-wrap gap-2 mb-3">
            {summaryItems.map((item) => (
              <span
                key={item.text}
                className="d-inline-flex align-items-center gap-1 border rounded-pill px-3 py-1"
                style={{ fontSize: '0.875rem' }}
              >
                <i className={`bi ${item.icon}`} aria-hidden="true" />
                {item.text}
              </span>
            ))}
          </div>
        )}

        {students.length > 0 && (
          <div className="mb-2">
            <span className="text-body-secondary">Applies to: </span>
            {students.map((student, idx) => (
              <span key={student.enrollmentId ?? student.uid}>
                {student.enrollmentId ? (
                  <a href={getStudentEnrollmentUrl(courseInstanceId, student.enrollmentId)}>
                    {student.name ?? student.uid}
                  </a>
                ) : (
                  <span>{student.name ?? student.uid}</span>
                )}
                {idx < students.length - 1 && ', '}
              </span>
            ))}
          </div>
        )}

        {dateTableRows.length === 0 && summaryItems.length === 0 && students.length === 0 && (
          <p className="text-body-secondary mb-0">No specific settings configured</p>
        )}
      </Card.Body>
    </Card>
  );
}
