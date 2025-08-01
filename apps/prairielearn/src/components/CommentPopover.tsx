import { escapeHtml, html } from '@prairielearn/html';

import { isRenderableComment } from '../lib/comments.js';

export function CommentPopover(comment: string | string[] | Record<string, any> | null) {
  if (!isRenderableComment(comment)) {
    return '';
  }
  const content = typeof comment === 'string' ? comment : JSON.stringify(comment, null, 2);

  return html`
    <button
      type="button"
      class="btn btn-xs btn-ghost"
      aria-label="Access rule comment"
      data-bs-toggle="popover"
      data-bs-container="body"
      data-bs-placement="auto"
      data-bs-html="true"
      data-bs-content="${escapeHtml(html`${content}`)}"
    >
      <i class="fa fa-comment"></i>
    </button>
  `;
}
