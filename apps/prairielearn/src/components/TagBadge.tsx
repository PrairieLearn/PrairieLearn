import type { Tag } from '../lib/db-types.js';

export function TagBadge({ tag }: { tag: Pick<Tag, 'color' | 'name'> }) {
  return <span class={`badge color-${tag.color}`}>{tag.name}</span>;
}

export function TagBadgeList({ tags }: { tags: Pick<Tag, 'color' | 'name'>[] | null }) {
  if (!tags) return null;

  return tags.map((tag) => (
    <span key={tag.name} class="me-1">
      <TagBadge tag={tag} />
    </span>
  ));
}
