import { Modal } from '../../../components/Modal.html.js';
import { html } from '@prairielearn/html';

import { hydrate } from '../../../lib/preact.js';

export function ResetQuestionVariantsModal({ csrfToken }: { csrfToken: string }) {
  return (
    <div
      // eslint-disable-next-line @eslint-react/dom/no-dangerously-set-innerhtml
      dangerouslySetInnerHTML={{
        __html: Modal({
          id: 'resetQuestionVariantsModal',
          title: 'Confirm reset question variants',
          body: html`
            <p>
              Are your sure you want to reset all current variants of this question?
              <strong>All ungraded attempts will be lost.</strong>
            </p>
            <p>Students will receive a new variant the next time they view this question.</p>
          `,
          footer: hydrate(
            <>
              <input type="hidden" name="__action" value="reset_question_variants" />
              <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
              <input
                type="hidden"
                name="unsafe_assessment_question_id"
                class="js-assessment-question-id"
                value=""
              />
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                Cancel
              </button>
              <button type="submit" class="btn btn-danger">
                Reset question variants
              </button>
            </>,
          ).toString(),
        }).toString(),
      }}
    />
  );
}
