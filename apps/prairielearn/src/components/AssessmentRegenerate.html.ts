import { html } from '@prairielearn/html';

import { Modal } from './Modal.html.js';

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
      <form method="POST">
        <input type="hidden" name="__csrf_token" value="${csrfToken}" />
        <input type="hidden" name="__action" value="regenerate_instance" />
        <button type="button" data-dismiss="modal" class="btn btn-secondary">Cancel</button>
        <button type="submit" class="btn btn-danger">Regenerate assessment instance</button>
      </form>
    `,
  });
}

export function RegenerateInstanceAlert() {
  return html`
    <div class="alert alert-warning alert-dismissible fade show">
      You are viewing your own assessment instance and have instructor permissions.
      <a href="#" role="button" data-toggle="modal" data-target="#regenerateInstanceModal">
        Regenerate this assessment instance
      </a>
      to pick up any changes to the underlying assessment or if you want to get a fresh set of
      questions.

      <button type="button" class="close" data-dismiss="alert" aria-label="Close">
        <span aria-hidden="true">&times;</span>
      </button>
    </div>
  `;
}
