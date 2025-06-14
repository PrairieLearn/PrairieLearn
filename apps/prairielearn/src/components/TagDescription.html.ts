import { html } from '@prairielearn/html';

import { type Tag } from '../lib/db-types.js';

export function TagDescription(tag: Tag) {
  if (!tag.implicit) {
    return tag.description;
  }

  return html`
    <span class="text-muted">
      Auto-generated from use in a question; add this tag to your infoCourse.json file to customize
    </span>
  `;
}
