import { escapeHtml, html, HtmlSafeString, unsafeHtml } from '@prairielearn/html';

export function CommentPopover(comment: string | string[] | Record<string, any> | null) {
  let content = '';
  if (comment === null) {
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
