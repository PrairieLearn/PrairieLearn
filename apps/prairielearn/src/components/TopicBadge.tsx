import { renderHtml } from '@prairielearn/preact';

import type { Topic } from '../lib/db-types.js';

export function TopicBadge({ topic }: { topic: Pick<Topic, 'name' | 'color'> }) {
  return <span className={`badge color-${topic.color}`}>{topic.name}</span>;
}

export function TopicBadgeHtml(topic: Pick<Topic, 'name' | 'color'>) {
  return renderHtml(<TopicBadge topic={topic} />);
}
