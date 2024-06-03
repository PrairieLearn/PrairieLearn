import { html } from '@prairielearn/html';

import type { Topic } from '../lib/db-types.js';

export function TopicBadge(topic: Topic | null) {
  if (topic == null) return html`—`;
  return html`<span class="badge color-${topic.color}">${topic.name}</span>`;
}
