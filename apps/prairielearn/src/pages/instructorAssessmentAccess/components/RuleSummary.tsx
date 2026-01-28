import { Badge, Button, Card, Table } from 'react-bootstrap';

import {
  getCourseInstanceStudentLabelsUrl,
  getStudentEnrollmentUrl,
} from '../../../lib/client/url.js';

import type { AccessControlRuleFormData, DeadlineEntry } from './types.js';

/** Verbosity level for summary display */
export type SummaryVerbosity = 'compact' | 'verbose';

/** Format a date string for display in summary */
function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

/** Row data for the date summary table */
interface DateTableRow {
  date: string;
  label: string;
  credit: string;
  visibility: string;
}

/** Generate table rows for date control summary */
function generateDateTableRows(
  rule: AccessControlRuleFormData,
  verbosity: SummaryVerbosity = 'compact',
): DateTableRow[] {
  const rows: DateTableRow[] = [];
  const dc = rule.dateControl;

  // Date control is enabled if:
  // 1. The explicit enabled flag is true (main rule), OR
  // 2. Any field is overridden (override rules implicitly enable date control)
  const isDateControlEnabled =
    dc.enabled ||
    dc.releaseDate.isOverridden ||
    dc.dueDate.isOverridden ||
    dc.earlyDeadlines.isOverridden ||
    dc.lateDeadlines.isOverridden ||
    dc.afterLastDeadline.isOverridden ||
    dc.durationMinutes.isOverridden ||
    dc.password.isOverridden;

  if (!isDateControlEnabled) {
    return rows;
  }

  // Collect all date entries with their metadata
  interface DateEntry {
    date: string;
    timestamp: number;
    label: string;
    credit: string;
    visibility: string;
  }

  const entries: DateEntry[] = [];

  // Release date
  if (dc.releaseDate.isOverridden && dc.releaseDate.isEnabled && dc.releaseDate.value) {
    const visibilityParts: string[] = ['Assessment opens'];
    if (rule.listBeforeRelease) {
      visibilityParts.push('(listed before release)');
    }
    entries.push({
      date: dc.releaseDate.value,
      timestamp: new Date(dc.releaseDate.value).getTime(),
      label: 'Release',
      credit: '—',
      visibility: visibilityParts.join(' '),
    });
  } else if (verbosity === 'verbose' && dc.releaseDate.isOverridden && !dc.releaseDate.isEnabled) {
    // In verbose mode, show when release date is explicitly disabled (released immediately)
    rows.push({
      date: 'Released immediately',
      label: '',
      credit: '—',
      visibility: 'Assessment opens',
    });
  }

  // Early deadlines
  if (dc.earlyDeadlines.isOverridden && dc.earlyDeadlines.isEnabled) {
    dc.earlyDeadlines.value.forEach((deadline: DeadlineEntry, index: number) => {
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
  }

  // Due date
  if (dc.dueDate.isOverridden && dc.dueDate.isEnabled && dc.dueDate.value) {
    entries.push({
      date: dc.dueDate.value,
      timestamp: new Date(dc.dueDate.value).getTime(),
      label: 'Due',
      credit: '100%',
      visibility: 'Open',
    });
  } else if (verbosity === 'verbose' && dc.dueDate.isOverridden && !dc.dueDate.isEnabled) {
    // In verbose mode, show when due date is explicitly disabled (no due date)
    rows.push({
      date: 'No due date',
      label: '',
      credit: '100%',
      visibility: 'Open',
    });
  }

  // Late deadlines
  if (dc.lateDeadlines.isOverridden && dc.lateDeadlines.isEnabled) {
    dc.lateDeadlines.value.forEach((deadline: DeadlineEntry, index: number) => {
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
  }

  // Sort entries by timestamp
  entries.sort((a, b) => a.timestamp - b.timestamp);

  // Convert entries to rows
  for (const entry of entries) {
    rows.push({
      date: formatDate(entry.date),
      label: entry.label,
      credit: entry.credit,
      visibility: entry.visibility,
    });
  }

  // After last deadline row (if configured)
  if (dc.afterLastDeadline.isOverridden && dc.afterLastDeadline.isEnabled) {
    const afterDeadline = dc.afterLastDeadline.value;
    const visibilityParts: string[] = [];

    if (afterDeadline.allowSubmissions) {
      visibilityParts.push('Submissions allowed');
    } else {
      visibilityParts.push('Closed');
    }

    // Include question/score visibility from afterComplete
    if (rule.afterComplete.questionVisibility.isOverridden) {
      if (rule.afterComplete.questionVisibility.value.hideQuestions) {
        visibilityParts.push('Questions hidden');
      }
    }
    if (rule.afterComplete.scoreVisibility.isOverridden) {
      if (rule.afterComplete.scoreVisibility.value.hideScore) {
        visibilityParts.push('Score hidden');
      }
    }

    rows.push({
      date: 'After last deadline',
      label: '',
      credit: afterDeadline.credit !== undefined ? `${afterDeadline.credit}%` : '0%',
      visibility: visibilityParts.join(', '),
    });
  }

  return rows;
}

/** Generate summary lines for non-date-related settings */
export function generateRuleSummary(
  rule: AccessControlRuleFormData,
  verbosity: SummaryVerbosity = 'compact',
): string[] {
  const lines: string[] = [];

  // Groups and students are handled separately with links in RuleSummaryCard

  // Enabled/disabled status
  if (!rule.enabled) {
    lines.push('Rule is disabled');
    return lines;
  }

  // Block access
  if (rule.blockAccess) {
    lines.push('Blocks access');
    return lines;
  }

  // Duration (still shown in list, not table)
  if (rule.dateControl.durationMinutes.isOverridden) {
    if (rule.dateControl.durationMinutes.isEnabled) {
      lines.push(`Time limit: ${rule.dateControl.durationMinutes.value} minutes`);
    } else if (verbosity === 'verbose') {
      lines.push('No time limit');
    }
  }

  // Password
  if (rule.dateControl.password.isOverridden) {
    if (rule.dateControl.password.isEnabled && rule.dateControl.password.value) {
      lines.push('Password protected');
    } else if (verbosity === 'verbose') {
      lines.push('No password');
    }
  }

  // PrairieTest control
  if (rule.prairieTestControl.enabled && rule.prairieTestControl.exams?.length) {
    lines.push(`${rule.prairieTestControl.exams.length} PrairieTest exam(s)`);
  }

  // After complete settings (only if not already shown in table via afterLastDeadline)
  const hasAfterLastDeadline =
    rule.dateControl.afterLastDeadline.isOverridden && rule.dateControl.afterLastDeadline.isEnabled;

  if (!hasAfterLastDeadline) {
    if (rule.afterComplete.questionVisibility.isOverridden) {
      if (rule.afterComplete.questionVisibility.value.hideQuestions) {
        lines.push('Questions hidden after completion');
      } else if (verbosity === 'verbose') {
        lines.push('Questions visible after completion');
      }
    }
    if (rule.afterComplete.scoreVisibility.isOverridden) {
      if (rule.afterComplete.scoreVisibility.value.hideScore) {
        lines.push('Score hidden after completion');
      } else if (verbosity === 'verbose') {
        lines.push('Score visible after completion');
      }
    }
  }

  return lines;
}

interface RuleSummaryCardProps {
  rule: AccessControlRuleFormData;
  isMainRule: boolean;
  title: string;
  editUrl: string;
  courseInstanceId: string;
  onEditStudentLabels?: () => void;
  onRemove?: () => void;
  /** Verbosity level for summary display. Defaults to 'compact' for main rule, 'verbose' for overrides. */
  verbosity?: SummaryVerbosity;
}

export function RuleSummaryCard({
  rule,
  isMainRule,
  title,
  onRemove,
  editUrl,
  courseInstanceId,
  onEditStudentLabels,
  verbosity,
}: RuleSummaryCardProps) {
  // Default verbosity: compact for main rule, verbose for overrides
  const effectiveVerbosity = verbosity ?? (isMainRule ? 'compact' : 'verbose');
  const summaryLines = generateRuleSummary(rule, effectiveVerbosity);
  const dateTableRows = generateDateTableRows(rule, effectiveVerbosity);

  // Get students for linking (only for individual/student rules)
  const students =
    !isMainRule && rule.appliesTo.targetType === 'individual' ? rule.appliesTo.individuals : [];

  // Get groups for linking (only for group rules)
  const groups = !isMainRule && rule.appliesTo.targetType === 'group' ? rule.appliesTo.groups : [];

  return (
    <Card className="mb-3">
      <Card.Header className="d-flex justify-content-between align-items-center">
        <div className="d-flex align-items-center gap-2">
          {!isMainRule && (
            <Badge bg="secondary">
              {rule.appliesTo.targetType === 'group' ? 'Group' : 'Student'}
            </Badge>
          )}
          <strong>{title}</strong>
          {!rule.enabled && <Badge bg="secondary">Disabled</Badge>}
          {rule.enabled && rule.blockAccess && (
            <Badge bg="warning" text="dark">
              Blocks access
            </Badge>
          )}
        </div>
        <div className="d-flex gap-2">
          {onEditStudentLabels && (
            <Button variant="outline-secondary" size="sm" onClick={onEditStudentLabels}>
              <i className="fa fa-users me-1" /> Groups
            </Button>
          )}
          <a href={editUrl} className="btn btn-outline-primary btn-sm">
            <i className="fa fa-pencil me-1" /> Edit
          </a>
          {onRemove && (
            <Button variant="outline-danger" size="sm" onClick={onRemove}>
              <i className="fa fa-trash me-1" /> Remove
            </Button>
          )}
        </div>
      </Card.Header>
      <Card.Body>
        {/* Date summary table */}
        {dateTableRows.length > 0 && (
          <div className="mb-3">
            <strong className="d-block mb-2">Deadlines</strong>
            <Table size="sm" className="mb-0" bordered>
              <thead className="table-light">
                <tr>
                  <th>Date</th>
                  <th>Credit</th>
                  <th>Visibility</th>
                </tr>
              </thead>
              <tbody>
                {dateTableRows.map((row) => (
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
        )}

        {/* Groups with links (for group-based rules) */}
        {groups.length > 0 && (
          <div className="mb-2">
            <span className="text-muted">Groups: </span>
            {groups.map((group, idx) => (
              <span key={group.groupId || group.name}>
                <a href={getCourseInstanceStudentLabelsUrl(courseInstanceId)}>{group.name}</a>
                {idx < groups.length - 1 && ', '}
              </span>
            ))}
          </div>
        )}

        {/* Students with links (for student-based rules) */}
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

        {/* Other settings list */}
        {summaryLines.length > 0 && (
          <ul className="mb-0 ps-3">
            {summaryLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}

        {/* Show message if nothing configured */}
        {dateTableRows.length === 0 &&
          summaryLines.length === 0 &&
          groups.length === 0 &&
          students.length === 0 && (
            <p className="text-muted mb-0">No specific settings configured</p>
          )}
      </Card.Body>
    </Card>
  );
}
