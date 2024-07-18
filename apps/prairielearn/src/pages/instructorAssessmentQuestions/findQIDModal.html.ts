import { html } from '@prairielearn/html';

import { Modal } from '../../components/Modal.html';
import { QuestionsTable, QuestionsTableHead } from '../../components/QuestionsTable.html.js';

export function FindQIDModal({
  questions,
  course_instances,
  showAddQuestionButton,
  showSharingSets,
  urlPrefix,
  plainUrlPrefix,
  csrfToken,
}) {
  return Modal({
    id: 'findQIDModal',
    title: 'Find QID',
    size: 'modal-xl',
    body: html`<div class="h-25 w-100 d-inline-block overflow-auto" style="height: 50px;">
      ${QuestionsTableHead()}
      ${QuestionsTable({
        questions,
        course_instances,
        showAddQuestionButton,
        showSharingSets,
        urlPrefix,
        plainUrlPrefix,
        __csrf_token: csrfToken,
        findQidMode: true,
      })}
    </div>`,
    footer: html` <button
        type="button"
        class="btn btn-primary"
        id="confirmFindQIDButton"
        data-dismiss="modal"
      >
        Add Selected Question
      </button>
      <button type="button" class="btn btn-secondary" data-dismiss="modal">Cancel</button>`,
  });
}
