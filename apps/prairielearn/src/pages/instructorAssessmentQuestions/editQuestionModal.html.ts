import { html } from '@prairielearn/html';

import { Modal } from '../../components/Modal.html';

export function EditQuestionModal({
  newQuestion,
  question,
}: {
  newQuestion: boolean;
  question?: Record<string, any>;
}) {
  console.log('modal question', question);
  return Modal({
    id: 'editQuestionModal',
    title: newQuestion ? 'Add Question' : 'Update Question',
    body: html`
      <div class="form-group">
        <label for="qid">QID</label>
        <div class="form-row">
          <input
            type="text"
            class="form-control qid col"
            id="qid"
            name="qid"
            aria-describedby="qidHelp"
            value="${question?.qid}"
          />
          <button type="button" class="btn btn-primary col-2" id="findQid">Find QID</button>
        </div>
        <small id="uidHelp" class="form-text text-muted"> This is the unique question ID. </small>
      </div>
    `,
    footer: html`
      <button type="button" class="btn btn-primary" id="updateQuestionButton" data-dismiss="modal">
        ${newQuestion ? 'Add Question' : 'Update Question'}
      </button>
      <button type="button" class="btn btn-secondary" data-dismiss="modal">Cancel</button>
    `,
  });
}
