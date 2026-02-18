import { escapeHtml, html } from '@prairielearn/html';
import { renderHtml } from '@prairielearn/react';

import { isRenderableComment } from '../lib/comments.js';

export function CommentPopover({
  comment,
}: {
  comment: string | string[] | Record<string, any> | null | undefined;
}) {
  if (!isRenderableComment(comment)) {
    return null;
  }
  const content = typeof comment === 'string' ? comment : JSON.stringify(comment, null, 2);

  return (
    <button
      type="button"
      className="btn btn-xs btn-ghost"
      aria-label="Access rule comment"
      data-bs-toggle="popover"
      data-bs-container="body"
      data-bs-placement="auto"
      data-bs-html="true"
      data-bs-content={escapeHtml(html`${content}`).toString()}
    >
      <i className="bi bi-chat-left-text" />
    </button>
  );
}

export function CommentPopoverHtml(comment: string | string[] | Record<string, any> | null) {
  return renderHtml(<CommentPopover comment={comment} />);
}
