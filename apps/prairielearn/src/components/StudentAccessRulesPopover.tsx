import { use } from 'react';
import type { z } from 'zod';

import { type HtmlSafeString, escapeHtml, html } from '@prairielearn/html';

import type { AccessTimelineEntrySchema, SprocAuthzAssessmentSchema } from '../lib/db-types.js';

import { TimezoneContext } from './FriendlyDate.js';

type AccessRule = z.infer<typeof SprocAuthzAssessmentSchema>['access_rules'][number];
type AccessTimelineEntry = z.infer<typeof AccessTimelineEntrySchema>;

function formatTimelineDate(isoString: string, timezone: string): string {
  const date = new Date(isoString);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

// -- Legacy (pre-formatted) popover content -----------------------------------

function legacyPopoverContentHtml(accessRules: AccessRule[]): HtmlSafeString {
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

/** Server-rendered HTML version (for use in `html` tagged templates). */
export function StudentAccessRulesPopover({ accessRules }: { accessRules: AccessRule[] }) {
  if (accessRules.length === 0) return '';

  return html`
    <button
      type="button"
      class="btn btn-xs btn-ghost"
      data-bs-toggle="popover"
      data-bs-container="body"
      data-bs-html="true"
      data-bs-title="Access details"
      data-bs-content="${escapeHtml(legacyPopoverContentHtml(accessRules))}"
    >
      <i class="fa fa-question-circle"></i>
    </button>
  `;
}

// -- Modern (raw data) popover content ----------------------------------------

function timelinePopoverContentHtml(
  timeline: AccessTimelineEntry[],
  timezone: string,
): HtmlSafeString {
  return html`
    <table class="table" aria-label="Access details">
      <tr>
        <th>Credit</th>
        <th>Start</th>
        <th>End</th>
      </tr>
      ${timeline.map(
        (entry) => html`
          <tr>
            <td>${entry.credit}%</td>
            <td>${formatTimelineDate(entry.start_date, timezone)}</td>
            <td>${entry.end_date ? formatTimelineDate(entry.end_date, timezone) : '—'}</td>
          </tr>
        `,
      )}
    </table>
  `;
}

/** Server-rendered HTML version for modern access timeline. */
export function StudentAccessTimelinePopoverHtml({
  accessTimeline,
  timezone,
}: {
  accessTimeline: AccessTimelineEntry[];
  timezone: string;
}) {
  if (accessTimeline.length === 0) return '';

  return html`
    <button
      type="button"
      class="btn btn-xs btn-ghost"
      data-bs-toggle="popover"
      data-bs-container="body"
      data-bs-html="true"
      data-bs-title="Access details"
      data-bs-content="${escapeHtml(timelinePopoverContentHtml(accessTimeline, timezone))}"
    >
      <i class="fa fa-question-circle"></i>
    </button>
  `;
}

// -- React versions -----------------------------------------------------------

/** React version for legacy access rules. */
export function StudentAccessRulesPopoverReact({ accessRules }: { accessRules: AccessRule[] }) {
  if (accessRules.length === 0) return null;

  return (
    <button
      type="button"
      className="btn btn-xs btn-ghost"
      data-bs-toggle="popover"
      data-bs-container="body"
      data-bs-html="true"
      data-bs-title="Access details"
      data-bs-content={escapeHtml(legacyPopoverContentHtml(accessRules)).toString()}
    >
      <i className="fa fa-question-circle" />
    </button>
  );
}

/** React version for modern access timeline. */
export function StudentAccessTimelinePopover({
  accessTimeline,
}: {
  accessTimeline: AccessTimelineEntry[];
}) {
  const timezone = use(TimezoneContext);
  if (accessTimeline.length === 0) return null;

  return (
    <button
      type="button"
      className="btn btn-xs btn-ghost"
      data-bs-toggle="popover"
      data-bs-container="body"
      data-bs-html="true"
      data-bs-title="Access details"
      data-bs-content={escapeHtml(timelinePopoverContentHtml(accessTimeline, timezone)).toString()}
    >
      <i className="fa fa-question-circle" />
    </button>
  );
}
