import { html } from '@prairielearn/html';

import { Modal } from './Modal.js';

export function TimeLimitExpiredModal({ showAutomatically }: { showAutomatically: boolean }) {
  return html`
    ${Modal({
      id: 'timeLimitExpiredModal',
      title: 'Time limit expired',
      body: html`<p>Your time limit expired and your assessment is now finished.</p>`,
      footer: html`
        <button type="button" class="btn btn-primary" data-bs-dismiss="modal">OK</button>
      `,
    })}
    ${showAutomatically
      ? html`
          <script type="module">
            // This script is type="module" so that it is deferred and runs after the DOM is ready.
            const modalElement = document.getElementById('timeLimitExpiredModal');
            window.bootstrap.Modal.getOrCreateInstance(modalElement).show();
          </script>
        `
      : ''}
  `;
}
