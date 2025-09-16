import { type Topic } from '../lib/db-types.js';

export function TopicDescription({ topic }: { topic: Topic }) {
  if (!topic.implicit) {
    return <>{topic.description}</>;
  }

  return (
    <span class="text-muted">
      Auto-generated from use in a question; add this topic to your infoCourse.json file to
      customize
    </span>
  );
}
