import { formatDate } from '@prairielearn/formatter';
import { escapeHtml, html } from '@prairielearn/html';

import type { LegacyAssessmentAccessRuleResult } from '../lib/assessment-access-control/authz-result.js';
import type { AccessTimelineEntry } from '../lib/assessment-access-control/timeline.js';

export function StudentAccessRulesSchedule({
  accessRules,
}: {
  accessRules: LegacyAssessmentAccessRuleResult[];
}) {
  return CreditSchedule({
    rows: accessRules.map((accessRule) => ({
      credit: accessRule.credit,
      start: accessRule.start_date,
      end: accessRule.end_date,
    })),
  });
}

export function StudentAccessTimelineSchedule({
  accessTimeline,
  displayTimezone,
}: {
  accessTimeline: readonly AccessTimelineEntry[];
  displayTimezone: string;
}) {
  // Hide segments where submissions aren't allowed. Rendering a 0%-credit
  // after-last-deadline row reads as "keep submitting for 0 credit" when
  // submissions are actually forbidden. The resolver still emits these entries
  // so other consumers (e.g. instructor views) can show the full picture.
  const visibleEntries = accessTimeline.filter((entry) => entry.submittable);
  return CreditSchedule({
    rows: visibleEntries.map((entry) => ({
      credit: `${entry.credit}%`,
      start: entry.startDate ? formatDate(entry.startDate, displayTimezone) : '—',
      end: entry.endDate ? formatDate(entry.endDate, displayTimezone) : '—',
    })),
  });
}

function CreditSchedule({ rows }: { rows: { credit: string; start: string; end: string }[] }) {
  if (rows.length === 0) return '';

  const content = html`
    <div class="table-responsive">
      <table class="table table-sm mb-0" aria-label="Credit schedule">
        <thead>
          <tr>
            <th scope="col">Credit</th>
            <th scope="col">Start</th>
            <th scope="col">End</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(
            (row) => html`
              <tr>
                <td>${row.credit}</td>
                <td>${row.start}</td>
                <td>${row.end}</td>
              </tr>
            `,
          )}
        </tbody>
      </table>
    </div>
  `;

  return html`
    <button
      type="button"
      class="btn btn-xs btn-outline-secondary ms-1"
      data-bs-toggle="popover"
      data-bs-container="body"
      data-bs-html="true"
      data-bs-title="Credit schedule"
      data-bs-content="${escapeHtml(content)}"
      data-bs-custom-class="popover-wide"
      data-bs-placement="bottom"
    >
      Credit schedule
    </button>
  `;
}
