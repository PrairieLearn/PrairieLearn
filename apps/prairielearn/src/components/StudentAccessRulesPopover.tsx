import { use } from 'react';
import type { z } from 'zod';

import { type HtmlSafeString, escapeHtml, html } from '@prairielearn/html';

import type { AccessTimelineEntry } from '../lib/assessment-access-control/resolver.js';
import type { SprocAuthzAssessmentSchema } from '../lib/db-types.js';

import { TimezoneContext } from './FriendlyDate.js';

type AccessRule = z.infer<typeof SprocAuthzAssessmentSchema>['access_rules'][number];

function formatTimelineDate(date: Date, timezone: string): string {
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
            <td>${entry.startDate ? formatTimelineDate(entry.startDate, timezone) : '—'}</td>
            <td>${entry.endDate ? formatTimelineDate(entry.endDate, timezone) : '—'}</td>
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

/**
 * Serialized shape of AccessTimelineEntry after Hydrate JSON serialization.
 * Date objects become ISO strings; the React component accepts this form.
 */
export interface SerializedAccessTimelineEntry {
  credit: number;
  startDate: string | null;
  endDate: string | null;
  active: boolean;
}

/** React version for modern access timeline (receives serialized dates from Hydrate). */
export function StudentAccessTimelinePopover({
  accessTimeline,
}: {
  accessTimeline: SerializedAccessTimelineEntry[];
}) {
  const timezone = use(TimezoneContext);
  if (accessTimeline.length === 0) return null;

  // Rehydrate string dates back to Date objects for formatting.
  const entries: AccessTimelineEntry[] = accessTimeline.map((entry) => ({
    credit: entry.credit,
    startDate: entry.startDate ? new Date(entry.startDate) : null,
    endDate: entry.endDate ? new Date(entry.endDate) : null,
    active: entry.active,
  }));

  return (
    <button
      type="button"
      className="btn btn-xs btn-ghost"
      data-bs-toggle="popover"
      data-bs-container="body"
      data-bs-html="true"
      data-bs-title="Access details"
      data-bs-content={escapeHtml(timelinePopoverContentHtml(entries, timezone)).toString()}
    >
      <i className="fa fa-question-circle" />
    </button>
  );
}
