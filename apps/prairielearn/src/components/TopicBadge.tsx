import { renderHtml } from '@prairielearn/preact';

import type { Topic } from '../lib/db-types.js';

export function TopicBadge({ topic }: { topic: Topic }) {
  return <span class={`badge color-${topic.color}`}>{topic.name}</span>;
}

export function TopicBadgeHtml(topic: Topic) {
  return renderHtml(<TopicBadge topic={topic} />);
}
