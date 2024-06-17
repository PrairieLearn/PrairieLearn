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

export function StudentAccessRulesPopover({
  assessmentSetName,
  assessmentNumber,
  accessRules,
}: {
  assessmentSetName: string;
  assessmentNumber: string;
  accessRules: AuthzAccessRule[];
}) {
  return html`
    <a
      tabindex="0"
      class="btn btn-xs"
      role="button"
      data-toggle="popover"
      data-trigger="focus"
      data-container="body"
      data-html="true"
      title="${assessmentSetName} ${assessmentNumber}"
      data-content="${escapeHtml(StudentAccessRulesPopoverContent({ accessRules }))}"
    >
      <i class="fa fa-question-circle"></i>
    </a>
  `;
}

function StudentAccessRulesPopoverContent({ accessRules }: { accessRules: AuthzAccessRule[] }) {
  return html`
    <table class="table">
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
