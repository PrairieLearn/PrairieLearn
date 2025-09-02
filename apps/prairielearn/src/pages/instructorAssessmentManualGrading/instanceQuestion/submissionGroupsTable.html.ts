import { html } from '@prairielearn/html';

import type { AiSubmissionGroup } from '../../../lib/db-types.js';

export function SubmissionGroups(aiSubmissionGroups: AiSubmissionGroup[]) {
  return html`
    <div class="table-responsive">
      <table class="table table-sm" aria-label="AI submission groups">
        <thead>
          <tr class="fw-bold">
            <td class="col-6">Group</td>
            <td class="col-8">Description</td>
          </tr>
        </thead>
        <tbody>
          ${aiSubmissionGroups.map(
            (aiSubmissionGroup) => html`
              <tr>
                <td>${aiSubmissionGroup.submission_group_name}</td>
                <td>${aiSubmissionGroup.submission_group_description}</td>
              </tr>
            `,
          )}
        </tbody>
      </table>
    </div>
  `
}