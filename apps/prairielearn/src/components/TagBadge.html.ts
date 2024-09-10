import { html, joinHtml } from '@prairielearn/html';

import type { Tag } from '../lib/db-types.js';

export function TagBadge(tag: Pick<Tag, 'color' | 'name'>) {
  return html`<span class="badge color-${tag.color}">${tag.name}</span>`;
}

export function TagBadgeList(tags: Pick<Tag, 'color' | 'name'>[] | null) {
  return joinHtml(tags?.map(TagBadge) ?? [], ' ');
}
