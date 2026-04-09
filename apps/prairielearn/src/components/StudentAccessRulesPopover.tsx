import type { z } from 'zod';

import { type HtmlSafeString, escapeHtml, html } from '@prairielearn/html';

import type { SprocAuthzAssessmentSchema } from '../lib/db-types.js';

type AccessRule = z.infer<typeof SprocAuthzAssessmentSchema>['access_rules'][number];

function popoverContentHtml(accessRules: AccessRule[]): HtmlSafeString {
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
      data-bs-content="${escapeHtml(popoverContentHtml(accessRules))}"
    >
      <i class="fa fa-question-circle"></i>
    </button>
  `;
}

/** React version (for use in hydrated components). */
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
      data-bs-content={escapeHtml(popoverContentHtml(accessRules)).toString()}
    >
      <i className="fa fa-question-circle" />
    </button>
  );
}
