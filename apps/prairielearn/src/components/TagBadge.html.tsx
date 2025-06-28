import type { Tag } from '../lib/db-types.js';
import { renderHtml } from '../lib/preact-html.js';

export function TagBadgeJsx({ tag }: { tag: Pick<Tag, 'color' | 'name'> }) {
  return <span class={`badge color-${tag.color}`}>{tag.name}</span>;
}

export function TagBadgeListJsx({ tags }: { tags: Pick<Tag, 'color' | 'name'>[] | null }) {
  return tags?.map((tag) => <TagBadgeJsx tag={tag} key={tag.name} />) ?? [];
}

export function TagBadge(tag: Pick<Tag, 'color' | 'name'>) {
  return renderHtml(<TagBadgeJsx tag={tag} />);
}

export function TagBadgeList(tags: Pick<Tag, 'color' | 'name'>[] | null) {
  return renderHtml(<TagBadgeListJsx tags={tags} />);
}
