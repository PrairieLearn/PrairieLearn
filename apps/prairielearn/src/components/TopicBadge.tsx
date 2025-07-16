import type { Topic } from '../lib/db-types.js';
import { renderHtml } from '../lib/preact-html.js';

export function TopicBadgeJsx({ topic }: { topic: Topic }) {
  return <span class={`badge color-${topic.color}`}>{topic.name}</span>;
}

export function TopicBadge(topic: Topic) {
  return renderHtml(<TopicBadgeJsx topic={topic} />);
}
