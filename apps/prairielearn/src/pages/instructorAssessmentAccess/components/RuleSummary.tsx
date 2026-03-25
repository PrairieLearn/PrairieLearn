import { Alert, Badge, Button, Card, Table } from 'react-bootstrap';

import { formatDate } from '@prairielearn/formatter';

import {
  getCourseInstanceStudentLabelsUrl,
  getStudentEnrollmentUrl,
} from '../../../lib/client/url.js';

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

  if (!isDateControlEnabled) {
    return rows;
  }

  const entries: (DateTableRow & { timestamp: number })[] = [];

  const releaseDate = rule.releaseDate;
  const dueDate = rule.dueDate;
  const earlyDeadlines = rule.earlyDeadlines;
  const lateDeadlines = rule.lateDeadlines;
  const afterLastDeadline = rule.afterLastDeadline;

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

export function generateRuleSummary(
  rule: RuleData,
  verbosity: SummaryVerbosity = 'compact',
): string[] {
  const lines: string[] = [];

  if (isOverrideFieldActive(rule, 'durationMinutes')) {
    const durationMinutes = rule.durationMinutes;
    if (durationMinutes !== null) {
      lines.push(`Time limit: ${durationMinutes} minutes`);
    } else if (verbosity === 'verbose') {
      lines.push('No time limit');
    }
  }

  if (isOverrideFieldActive(rule, 'password')) {
    const password = rule.password;
    if (password !== null && password !== '') {
      lines.push('Password protected');
    } else if (verbosity === 'verbose') {
      lines.push('No password');
    }
  }

  if (isMainRuleData(rule) && rule.prairieTestEnabled && rule.prairieTestExams.length > 0) {
    lines.push(
      `${rule.prairieTestExams.length} PrairieTest ${rule.prairieTestExams.length === 1 ? 'exam' : 'exams'}`,
    );
  }

  const hasAfterLastDeadline = rule.afterLastDeadline != null;

  if (!hasAfterLastDeadline) {
    if (isOverrideFieldActive(rule, 'questionVisibility')) {
      const qv = rule.questionVisibility;
      if (qv.hideQuestions) {
        lines.push('Questions hidden after completion');
      } else if (verbosity === 'verbose') {
        lines.push('Questions visible after completion');
      }
    }
    if (isOverrideFieldActive(rule, 'scoreVisibility')) {
      const sv = rule.scoreVisibility;
      if (sv.hideScore) {
        lines.push('Score hidden after completion');
      } else if (verbosity === 'verbose') {
        lines.push('Score visible after completion');
      }
    }
  }

  return lines;
}

export function DateTableView({ rows }: { rows: DateTableRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="table-responsive">
      <Table size="sm" className="mb-0" bordered>
        <thead className="table-light">
          <tr>
            <th>Date</th>
            <th>Credit</th>
            <th>Visibility</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.date}-${row.label}-${row.credit}-${row.visibility}`}>
              <td>
                {row.label && <span className="text-muted me-1">{row.label}:</span>}
                {row.date}
              </td>
              <td>{row.credit}</td>
              <td>{row.visibility}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

interface RuleSummaryCardProps {
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
}

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
}: RuleSummaryCardProps) {
  const effectiveVerbosity: SummaryVerbosity = isMainRule ? 'compact' : 'verbose';
  const summaryLines = generateRuleSummary(rule, effectiveVerbosity);
  const dateTableRows = generateDateTableRows(rule, displayTimezone, effectiveVerbosity);

  const overrideRule = !isMainRule ? (rule as OverrideData) : null;

  const students =
    overrideRule?.appliesTo.targetType === 'individual' ? overrideRule.appliesTo.individuals : [];

  const studentLabels =
    overrideRule?.appliesTo.targetType === 'student_label'
      ? overrideRule.appliesTo.studentLabels
      : [];

  return (
    <Card className="mb-3">
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
          {overrideRule && (
            <Badge bg="secondary">
              {overrideRule.appliesTo.targetType === 'student_label' ? 'Student label' : 'Student'}
            </Badge>
          )}
          <strong>{title}</strong>
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
          <div className="mb-3">
            <strong className="d-block mb-2">Deadlines</strong>
            <DateTableView rows={dateTableRows} />
          </div>
        )}

        {studentLabels.length > 0 && (
          <div className="mb-2">
            <span className="text-muted">Student labels: </span>
            {studentLabels.map((studentLabel, idx) => (
              <span key={studentLabel.studentLabelId || studentLabel.name}>
                <a href={getCourseInstanceStudentLabelsUrl(courseInstanceId)}>
                  {studentLabel.name}
                </a>
                {idx < studentLabels.length - 1 && ', '}
              </span>
            ))}
          </div>
        )}

        {students.length > 0 && (
          <div className="mb-2">
            <span className="text-muted">Students: </span>
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

        {summaryLines.length > 0 && (
          <ul className="mb-0 ps-3">
            {summaryLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}

        {dateTableRows.length === 0 &&
          summaryLines.length === 0 &&
          studentLabels.length === 0 &&
          students.length === 0 && (
            <p className="text-muted mb-0">No specific settings configured</p>
          )}
      </Card.Body>
    </Card>
  );
}
