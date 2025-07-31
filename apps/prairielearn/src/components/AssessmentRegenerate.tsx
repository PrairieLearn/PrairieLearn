import { html } from '@prairielearn/html';

import { Modal } from './Modal.js';

export function RegenerateInstanceModal({ csrfToken }: { csrfToken: string }) {
  return Modal({
    id: 'regenerateInstanceModal',
    title: 'Regenerate assessment instance',
    body: html`
      <p class="text-danger">
        <strong>Warning:</strong> Regenerating the assessment instance will select a new set of
        questions from this assessment. Any progress on the current assessment instance will be
        lost.
      </p>
      <p>Are you sure you want to regenerate the assessment instance?</p>
    `,
    footer: html`
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <input type="hidden" name="__action" value="regenerate_instance" />
      <button type="button" data-bs-dismiss="modal" class="btn btn-secondary">Cancel</button>
      <button type="submit" class="btn btn-danger">Regenerate assessment instance</button>
    `,
  });
}

export function RegenerateInstanceAlert() {
  return html`
    <div class="alert alert-warning border-warning alert-dismissible fade show">
      Course staff:
      <!-- [html-validate-disable-block prefer-native-element] -->
      <a href="#" role="button" data-bs-toggle="modal" data-bs-target="#regenerateInstanceModal">
        Regenerate your assessment instance</a
      >
      to pick up changes to the assessment or to get a fresh set of questions.

      <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    </div>
  `;
}
