import { html } from '@prairielearn/html';

import type { AiSubmissionGroup } from '../../../lib/db-types.js';
import { idsEqual } from '../../../lib/id.js';

export function AISubmissionGroupSwitcher({
  aiSubmissionGroups,
  currentSubmissionGroupId,
}: {
  aiSubmissionGroups: AiSubmissionGroup[];
  currentSubmissionGroupId: string | null;
}) {
  return html`
    ${aiSubmissionGroups.map((group) => {
      const isSelected = currentSubmissionGroupId
        ? idsEqual(group.id, currentSubmissionGroupId)
        : group.id === '';
      return html`
        <a
          class="dropdown-item ${isSelected ? 'active' : ''}"
          role="option"
          aria-current="${isSelected ? 'page' : ''}"
          href="#"
          data-submission-group-id="${group.id}"
        >
          ${group.submission_group_name}
        </a>
      `;
    })}
  `.toString();
}
