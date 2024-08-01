import { html } from '@prairielearn/html';

import { Modal } from '../../components/Modal.html.js';

export function DeleteQuestionModal({
  zoneIndex,
  questionIndex,
  alternativeIndex,
}: {
  zoneIndex: number;
  questionIndex: number;
  alternativeIndex?: number;
}) {
  return Modal({
    id: 'deleteQuestionModal',
    title: 'Remove Question',
    body: html`<p>Are you sure you want to remove this question from the assessment?</p>`,
    footer: html`
      <button
        type="button"
        class="btn btn-danger js-confirm-delete-button"
        data-dismiss="modal"
        data-zone-index="${zoneIndex}"
        data-question-index="${questionIndex}"
        data-alternative-index="${alternativeIndex}"
      >
        Remove Question
      </button>
      <button type="button" class="btn btn-secondary" data-dismiss="modal">Cancel</button>
    `,
  });
}
