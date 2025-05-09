import { html } from '@prairielearn/html';

export function CommentPopover(comment: string | null) {
  return html`
    <button
      type="button"
      class="btn btn-xs btn-ghost"
      data-bs-toggle="popover"
      data-bs-container="body"
      data-bs-placement="auto"
      data-bs-content="${comment}"
    >
      <i class="fa fa-comment"></i>
    </button>
  `;
}
