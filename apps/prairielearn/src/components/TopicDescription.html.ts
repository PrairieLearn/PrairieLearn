import { html } from '@prairielearn/html';

import { type Topic } from '../lib/db-types.js';

export function TopicDescription({ topic_description }: { topic_description: Topic }) {
  if (!topic_description.implicit) {
    return topic_description.description;
  }

  return html`
    <span class="text-muted">
      Auto-generated from use in a question; add this topic to your infoCourse.json file to
      customize
    </span>
  `;
}
