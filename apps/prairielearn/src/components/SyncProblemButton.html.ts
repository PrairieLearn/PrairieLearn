import { escapeHtml, html, unsafeHtml } from '@prairielearn/html';

import { ansiToHtml } from '../lib/chalk.js';

export function SyncProblemButton({ output, type }: { output: string; type: 'error' | 'warning' }) {
  const title = type === 'error' ? 'Sync Errors' : 'Sync Warnings';
  const classes =
    type === 'error' ? 'fa-times text-danger' : 'fa-exclamation-triangle text-warning';

  const popoverContent = html`<pre
    class="text-white rounded p-3 mb-0"
    style="background-color: black;"
  >
${unsafeHtml(ansiToHtml(output))}</pre
  >`;

  return html`
    <button
      class="btn btn-xs btn-ghost me-1"
      data-bs-toggle="popover"
      data-bs-container="body"
      data-bs-html="true"
      data-bs-title="${title}"
      data-bs-content="${escapeHtml(popoverContent)}"
      data-bs-custom-class="popover-wide"
    >
      <i class="fa ${classes}" aria-hidden="true"></i>
    </button>
  `;
}
