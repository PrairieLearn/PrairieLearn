import { escapeHtml, html } from '@prairielearn/html';

export function CommentPopover(comment: string | string[] | Record<string, any> | null) {
  let content = '';
  if (
    !comment ||
    (Array.isArray(comment) && comment.toString() === '[]') ||
    (typeof comment === 'object' && Object.keys(comment).length === 0)
  ) {
    return '';
  } else if (typeof comment === 'string') {
    content = comment;
  } else {
    content = JSON.stringify(comment, null, 2);
  }

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
