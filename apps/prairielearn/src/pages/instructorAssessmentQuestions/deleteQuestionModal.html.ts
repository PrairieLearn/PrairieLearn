import { html } from '@prairielearn/html';

import { Modal } from '../../components/Modal.html.js';

export function DeleteQuestionModal({
  zoneNumber,
  questionNumber,
  alternativeNumber,
}: {
  zoneNumber: number;
  questionNumber: number;
  alternativeNumber?: number;
}) {
  return Modal({
    id: 'deleteQuestionModal',
    title: 'Remove Question',
    body: html`<p>Are you sure you want to remove this question from the assessment?</p>`,
    footer: html`
      <button
        type="button"
        class="btn btn-danger"
        id="confirmDeleteButton"
        data-dismiss="modal"
        data-zone-number="${zoneNumber}"
        data-question-number="${questionNumber}"
        data-alternative-number="${alternativeNumber}"
      >
        Remove Question
      </button>
      <button type="button" class="btn btn-secondary" data-dismiss="modal">Cancel</button>
    `,
  });
}
