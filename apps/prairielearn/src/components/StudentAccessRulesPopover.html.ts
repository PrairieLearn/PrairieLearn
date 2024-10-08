import { z } from 'zod';

import { escapeHtml, html } from '@prairielearn/html';

import { EnumModeSchema } from '../lib/db-types.js';

export const AuthzAccessRuleSchema = z.object({
  credit: z.string(),
  time_limit_min: z.string(),
  start_date: z.string(),
  end_date: z.string(),
  mode: EnumModeSchema.nullable(),
  active: z.boolean().nullable(),
});
export type AuthzAccessRule = z.infer<typeof AuthzAccessRuleSchema>;

export function StudentAccessRulesPopover({ accessRules }: { accessRules: AuthzAccessRule[] }) {
  return html`
    <button
      type="button"
      class="btn btn-xs btn-ghost"
      data-toggle="popover"
      data-container="body"
      data-html="true"
      title="Access details"
      data-content="${escapeHtml(StudentAccessRulesPopoverContent({ accessRules }))}"
      aria-label="Access details"
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
