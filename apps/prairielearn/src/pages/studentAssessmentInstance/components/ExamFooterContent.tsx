import { html } from '@prairielearn/html';

export function ExamFooterContent({
  someQuestionsAllowRealTimeGrading,
  someQuestionsForbidRealTimeGrading,
  savedAnswers,
  suspendedSavedAnswers,
  authorizedEdit,
  hasPassword,
  showClosedAssessment,
  csrfToken,
}: {
  someQuestionsAllowRealTimeGrading: boolean;
  someQuestionsForbidRealTimeGrading: boolean;
  savedAnswers: number;
  suspendedSavedAnswers: number;
  authorizedEdit: boolean;
  hasPassword: boolean;
  showClosedAssessment: boolean;
  csrfToken: string;
}) {
  return html`
    ${someQuestionsAllowRealTimeGrading
      ? html`
          <form name="grade-form" method="POST">
            <input type="hidden" name="__action" value="grade" />
            <input type="hidden" name="__csrf_token" value="${csrfToken}" />
            ${savedAnswers > 0
              ? html`
                  <button type="submit" class="btn btn-info" ${!authorizedEdit ? 'disabled' : ''}>
                    Grade ${savedAnswers} saved ${savedAnswers !== 1 ? 'answers' : 'answer'}
                  </button>
                `
              : html`
                  <button type="submit" class="btn btn-info" disabled>
                    No saved answers to grade
                  </button>
                `}
          </form>
          <ul class="mb-0">
            ${suspendedSavedAnswers > 1
              ? html`
                  <li>
                    There are ${suspendedSavedAnswers} saved answers that cannot be graded yet
                    because their grade rate has not been reached. They are marked with the
                    <i class="fa fa-hourglass-half"></i> icon above. Reload this page to update this
                    information.
                  </li>
                `
              : suspendedSavedAnswers === 1
                ? html`
                    <li>
                      There is one saved answer that cannot be graded yet because its grade rate has
                      not been reached. It is marked with the
                      <i class="fa fa-hourglass-half"></i> icon above. Reload this page to update
                      this information.
                    </li>
                  `
                : ''}
            <li>
              Submit your answer to each question with the
              <strong>Save & Grade</strong> or <strong>Save only</strong> buttons on the question
              page.
            </li>
            <li>
              Look at <strong>Status</strong> to confirm that each question has been
              ${someQuestionsForbidRealTimeGrading ? 'either saved or graded' : 'graded'}. Questions
              with <strong>Available points</strong> can be attempted again for more points.
              Attempting questions again will never reduce the points you already have.
            </li>
            ${hasPassword ||
            !showClosedAssessment ||
            // If this is true, this assessment has a mix of real-time-graded and
            // non-real-time-graded questions. We need to show the "Finish assessment"
            // button.
            someQuestionsForbidRealTimeGrading
              ? html`
                  <li>
                    After you have answered all the questions completely, click here:
                    <button
                      class="btn btn-danger"
                      data-bs-toggle="modal"
                      data-bs-target="#confirmFinishModal"
                      ${!authorizedEdit ? 'disabled' : ''}
                    >
                      Finish assessment
                    </button>
                  </li>
                `
              : html`
                  <li>
                    When you are done, please logout and close your browser. If you have any saved
                    answers when you leave, they will be automatically graded before your final
                    score is computed.
                  </li>
                `}
          </ul>
        `
      : html`
          <ul class="mb-0">
            <li>
              Submit your answer to each question with the
              <strong>Save</strong> button on the question page.
            </li>
            <li>
              After you have answered all the questions completely, click here:
              <button
                class="btn btn-danger"
                data-bs-toggle="modal"
                data-bs-target="#confirmFinishModal"
                ${!authorizedEdit ? 'disabled' : ''}
              >
                Finish assessment
              </button>
            </li>
          </ul>
        `}
  `;
}
