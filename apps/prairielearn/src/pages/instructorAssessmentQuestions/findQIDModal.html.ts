import { html } from '@prairielearn/html';

import { Modal } from '../../components/Modal.html.js';
import { QuestionsTable, QuestionsTableHead } from '../../components/QuestionsTable.html.js';

export function FindQIDModal({
  questions,
  course_instances,
  showAddQuestionButton,
  showSharingSets,
  urlPrefix,
  plainUrlPrefix,
  csrfToken,
  currentQid,
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
        showCheckboxes: true,
        currentQid,
      })}
    </div>`,
    footer: html` <button
        type="button"
        class="btn btn-primary"
        id="confirmFindQIDButton"
        data-dismiss="modal"
      >
        Add selected question
      </button>
      <button
        type="button"
        class="btn btn-secondary"
        data-target="#editQuestionModal"
        data-toggle="modal"
      >
        Cancel
      </button>`,
  });
}
