import { html } from '@prairielearn/html';

import { type Tag } from '../lib/db-types.js';

const display = 'Auto-generated from use in a question; add this tag to your infoCourse.json file to customize';

export function TagDescription({ tag_description, raw }: { tag_description: Tag, raw?: boolean }) {
  if (!tag_description.implicit) {
    return tag_description.description;
  }

  if(raw) {
    return html`
        ${display}
    `;
  }

  return html`
    <span class="text-muted">
      ${display}
    </span>
  `;
}
