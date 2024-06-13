import { html } from '@prairielearn/html';

import { Modal } from './Modal.html.js';

export function TimeLimitExpiredModal({ showAutomatically }: { showAutomatically: boolean }) {
  return html`
    ${Modal({
      id: 'timeLimitExpiredModal',
      title: 'Time limit expired',
      body: html`<p>Your time limit expired and your assessment is now finished.</p>`,
      footer: html`
        <button type="button" class="btn btn-primary" data-dismiss="modal">OK</button>
      `,
    })}
    ${showAutomatically
      ? html`
          <script>
            $(function () {
              $('#timeLimitExpiredModal').modal('show');
            });
          </script>
        `
      : ''}
  `;
}
