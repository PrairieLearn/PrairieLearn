import { useId } from 'react';
import { z } from 'zod';

import { escapeHtml, html } from '@prairielearn/html';
import { OverlayTrigger } from '@prairielearn/ui';

import type { AccessTimelineEntry } from '../lib/assessment-access-control/timeline.js';
import { EnumModeSchema } from '../lib/db-types.js';

import { FriendlyDate } from './FriendlyDate.js';

export const AuthzAccessRuleSchema = z.object({
  credit: z.string(),
  time_limit_min: z.string(),
  start_date: z.string(),
  end_date: z.string(),
  mode: EnumModeSchema.nullable(),
  active: z.boolean().nullable(),
});
type AuthzAccessRule = z.infer<typeof AuthzAccessRuleSchema>;

export function StudentAccessRulesPopover({ accessRules }: { accessRules: AuthzAccessRule[] }) {
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

function StudentAccessRulesPopoverContent({ accessRules }: { accessRules: AuthzAccessRule[] }) {
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
  accessTimeline: AccessTimelineEntry[];
  displayTimezone: string;
}) {
  const popoverId = useId();
  return (
    <OverlayTrigger
      trigger="click"
      placement="auto"
      popover={{
        props: { id: popoverId },
        header: 'Access details',
        body: (
          <table className="table mb-0" aria-label="Access details">
            <thead>
              <tr>
                <th>Credit</th>
                <th>Start</th>
                <th>End</th>
              </tr>
            </thead>
            <tbody>
              {accessTimeline.map((entry) => (
                <tr
                  key={`${entry.credit}-${entry.startDate?.toISOString() ?? ''}-${entry.endDate?.toISOString() ?? ''}`}
                >
                  <td>{entry.credit}%</td>
                  <td>
                    {entry.startDate ? (
                      <FriendlyDate date={entry.startDate} timezone={displayTimezone} tooltip />
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    {entry.endDate ? (
                      <FriendlyDate date={entry.endDate} timezone={displayTimezone} tooltip />
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ),
      }}
      rootClose
    >
      <button type="button" className="btn btn-xs btn-ghost" aria-label="Access details">
        <i className="fa fa-question-circle" />
      </button>
    </OverlayTrigger>
  );
}

StudentAccessTimelinePopover.displayName = 'StudentAccessTimelinePopover';
