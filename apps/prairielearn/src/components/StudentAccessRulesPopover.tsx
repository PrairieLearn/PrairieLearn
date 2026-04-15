import { z } from 'zod';

import { escapeHtml, html } from '@prairielearn/html';
import { run } from '@prairielearn/run';

import type { AccessTimelineEntry } from '../lib/assessment-access-control/resolver.js';
import { EnumModeSchema } from '../lib/db-types.js';

import { FriendlyDateHtml } from './FriendlyDate.js';

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
      data-bs-content="${escapeHtml(
        run(() => {
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
        }),
      )}"
    >
      <i class="fa fa-question-circle"></i>
    </button>
  `;
}

export function StudentAccessTimelinePopover({
  accessTimeline,
  displayTimezone,
}: {
  accessTimeline: AccessTimelineEntry[];
  displayTimezone: string;
}) {
  return html`
    <button
      type="button"
      class="btn btn-xs btn-ghost"
      data-bs-toggle="popover"
      data-bs-container="body"
      data-bs-html="true"
      data-bs-title="Access details"
      data-bs-content="${escapeHtml(
        run(() => {
          return html`
            <table class="table" aria-label="Access details">
              <thead>
                <tr>
                  <th>Credit</th>
                  <th>Start</th>
                  <th>End</th>
                </tr>
              </thead>
              <tbody>
                ${accessTimeline.map(
                  (entry) => html`
                    <tr>
                      <td>${entry.credit}%</td>
                      <td>
                        ${entry.startDate
                          ? FriendlyDateHtml({ date: entry.startDate, timezone: displayTimezone })
                          : '—'}
                      </td>
                      <td>
                        ${entry.endDate
                          ? FriendlyDateHtml({ date: entry.endDate, timezone: displayTimezone })
                          : '—'}
                      </td>
                    </tr>
                  `,
                )}
              </tbody>
            </table>
          `;
        }),
      )}"
    >
      <i class="fa fa-question-circle"></i>
    </button>
  `;
}
