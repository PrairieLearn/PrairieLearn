import { html } from '@prairielearn/html';

import type { InstanceQuestionGroup } from '../../../lib/db-types.js';
import { idsEqual } from '../../../lib/id.js';

export function InstanceQuestionGroupSwitcher({
  instanceQuestionGroups,
  currentInstanceQuestionGroupId,
}: {
  instanceQuestionGroups: InstanceQuestionGroup[];
  currentInstanceQuestionGroupId: string | null;
}) {
  return html`
    ${instanceQuestionGroups.map((group) => {
      const isSelected = currentInstanceQuestionGroupId
        ? idsEqual(group.id, currentInstanceQuestionGroupId)
        : group.id === '';
      return html`
        <a
          class="dropdown-item ${isSelected ? 'active' : ''}"
          role="option"
          aria-current="${isSelected ? 'page' : ''}"
          href="#"
          data-instance-question-group-id="${group.id}"
        >
          ${group.instance_question_group_name}
        </a>
      `;
    })}
  `.toString();
}
