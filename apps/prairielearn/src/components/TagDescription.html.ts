import { html } from '@prairielearn/html';

import { type Tag } from '../lib/db-types.js';

export function TagDescription({
    tag_description,
}: {
    tag_description: Tag;
}) {
    if(!tag_description.implicit) {
        return tag_description.description;
    }

    return html`
    <span class="text-muted">
        Auto-generated from use in a question; add this tag to your infoCourse.json file to customize
      </span>
    `;
}
