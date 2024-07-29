import { onDocumentReady } from '@prairielearn/browser-utils';

onDocumentReady(() => {
  document.querySelectorAll<HTMLButtonElement>('.js-assign-grader-btn').forEach((button) =>
    button.addEventListener('click', () => {
      const assessmentQuestionInput = document.querySelector<HTMLInputElement>(
        '#grader-assignment-modal input[name="unsafe_assessment_question_id"]',
      );
      if (assessmentQuestionInput) {
        assessmentQuestionInput.value = button.dataset.assessmentQuestionId ?? '';
      }
      $('#grader-assignment-modal').modal('show');
    }),
  );
});
