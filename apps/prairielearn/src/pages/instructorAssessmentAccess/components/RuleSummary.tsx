import { Badge, Button, Card, Table } from 'react-bootstrap';

import type { AccessControlRuleFormData, DeadlineEntry } from './types.js';

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
function generateDateTableRows(rule: AccessControlRuleFormData): DateTableRow[] {
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
  isMainRule: boolean,
): string[] {
  const lines: string[] = [];

  // Targets (only for overrides)
  if (!isMainRule && rule.groups && rule.groups.length > 0) {
    lines.push(`Groups: ${rule.groups.join(', ')}`);
  }

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
  if (rule.dateControl.durationMinutes.isOverridden && rule.dateControl.durationMinutes.isEnabled) {
    lines.push(`Time limit: ${rule.dateControl.durationMinutes.value} minutes`);
  }

  // Password
  if (rule.dateControl.password.isOverridden && rule.dateControl.password.isEnabled) {
    lines.push('Password protected');
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
      }
    }
    if (rule.afterComplete.scoreVisibility.isOverridden) {
      if (rule.afterComplete.scoreVisibility.value.hideScore) {
        lines.push('Score hidden after completion');
      }
    }
  }

  return lines;
}

interface RuleSummaryCardProps {
  rule: AccessControlRuleFormData;
  isMainRule: boolean;
  title: string;
  onEdit: () => void;
  onEditStudentGroups?: () => void;
  onRemove?: () => void;
}

export function RuleSummaryCard({
  rule,
  isMainRule,
  title,
  onRemove,
  onEdit,
  onEditStudentGroups,
}: RuleSummaryCardProps) {
  const summaryLines = generateRuleSummary(rule, isMainRule);
  const dateTableRows = generateDateTableRows(rule);

  return (
    <Card class="mb-3">
      <Card.Header class="d-flex justify-content-between align-items-center">
        <div class="d-flex align-items-center gap-2">
          <strong>{title}</strong>
          {!rule.enabled && <Badge bg="secondary">Disabled</Badge>}
          {rule.enabled && rule.blockAccess && (
            <Badge bg="warning" text="dark">
              Blocks access
            </Badge>
          )}
        </div>
        <div class="d-flex gap-2">
          {onEditStudentGroups && (
            <Button variant="outline-secondary" size="sm" onClick={onEditStudentGroups}>
              <i class="fa fa-users me-1" /> Groups
            </Button>
          )}
          <Button variant="outline-primary" size="sm" onClick={onEdit}>
            <i class="fa fa-pencil me-1" /> Edit
          </Button>
          {onRemove && (
            <Button variant="outline-danger" size="sm" onClick={onRemove}>
              <i class="fa fa-trash me-1" /> Remove
            </Button>
          )}
        </div>
      </Card.Header>
      <Card.Body>
        {/* Date summary table */}
        {dateTableRows.length > 0 && (
          <div class="mb-3">
            <strong class="d-block mb-2">Deadlines</strong>
            <Table size="sm" class="mb-0" bordered>
              <thead class="table-light">
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
                      {row.label && <span class="text-muted me-1">{row.label}:</span>}
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

        {/* Other settings list */}
        {summaryLines.length > 0 && (
          <ul class="mb-0 ps-3">
            {summaryLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}

        {/* Show message if nothing configured */}
        {dateTableRows.length === 0 && summaryLines.length === 0 && (
          <p class="text-muted mb-0">No specific settings configured</p>
        )}
      </Card.Body>
    </Card>
  );
}
