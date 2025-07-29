import type { Topic } from '../lib/db-types.js';
import { renderHtml } from '../lib/preact-html.js';

export function TopicBadge({ topic }: { topic: Topic }) {
  return <span class={`badge color-${topic.color}`}>{topic.name}</span>;
}

export function TopicBadgeHtml(topic: Topic) {
  return renderHtml(<TopicBadge topic={topic} />);
}
