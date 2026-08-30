import { formatDate } from '@prairielearn/formatter';
import { escapeHtml, html } from '@prairielearn/html';

import type { LegacyAssessmentAccessRuleResult } from '../lib/assessment-access-control/authz-result.js';
import type { AccessTimelineEntry } from '../lib/assessment-access-control/timeline.js';

export function StudentAccessRulesPopover({
  accessRules,
}: {
  accessRules: LegacyAssessmentAccessRuleResult[];
}) {
  return html`
    <button
      type="button"
      class="btn btn-xs btn-ghost"
      data-bs-toggle="popover"
      data-bs-container="body"
      data-bs-html="true"
      data-bs-title="Access details"
      data-bs-content="${escapeHtml(StudentAccessRulesPopoverContent({ accessRules }))}"
    >
      <i class="fa fa-question-circle"></i>
    </button>
  `;
}

function StudentAccessRulesPopoverContent({
  accessRules,
}: {
  accessRules: LegacyAssessmentAccessRuleResult[];
}) {
  return html`
    <table class="table" aria-label="Access details">
      <tr>
        <th>Credit</th>
        <th>Start</th>
        <th>End</th>
      </tr>
      ${accessRules.map(
        (accessRule) => html`
          <tr>
            <td>${accessRule.credit}</td>
            <td>${accessRule.start_date}</td>
            <td>${accessRule.end_date}</td>
          </tr>
        `,
      )}
    </table>
  `;
}

export function StudentAccessTimelinePopover({
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
  if (visibleEntries.length === 0) return '';
  return html`
    <button
      type="button"
      class="btn btn-xs btn-ghost"
      data-bs-toggle="popover"
      data-bs-container="body"
      data-bs-html="true"
      data-bs-title="Access details"
      data-bs-content="${escapeHtml(
        StudentAccessTimelinePopoverContent({ visibleEntries, displayTimezone }),
      )}"
    >
      <i class="fa fa-question-circle"></i>
    </button>
  `;
}

function StudentAccessTimelinePopoverContent({
  visibleEntries,
  displayTimezone,
}: {
  visibleEntries: AccessTimelineEntry[];
  displayTimezone: string;
}) {
  return html`
    <table class="table" aria-label="Access details">
      <tr>
        <th>Credit</th>
        <th>Start</th>
        <th>End</th>
      </tr>
      ${visibleEntries.map(
        (entry) => html`
          <tr>
            <td>${entry.credit}</td>
            <td>${entry.startDate ? formatDate(entry.startDate, displayTimezone) : '—'}</td>
            <td>${entry.endDate ? formatDate(entry.endDate, displayTimezone) : '—'}</td>
          </tr>
        `,
      )}
    </table>
  `;
}
