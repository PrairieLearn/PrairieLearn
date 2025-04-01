import { html } from '@prairielearn/html';

import { type Topic } from '../lib/db-types.js';

export function TopicDescription(topic: Topic) {
  if (!topic.implicit) {
    return topic.description;
  }

  return html`
    <span class="text-muted">
      Auto-generated from use in a question; add this topic to your infoCourse.json file to
      customize
    </span>
  `;
}
