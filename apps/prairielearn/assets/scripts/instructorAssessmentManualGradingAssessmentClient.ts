import { onDocumentReady, templateFromAttributes } from '@prairielearn/browser-utils';

onDocumentReady(() => {
  const modal = document.getElementById('grader-assignment-modal');
  document.querySelectorAll<HTMLButtonElement>('.js-assign-grader-btn').forEach((button) =>
    button.addEventListener('click', () => {
      if (modal) {
        templateFromAttributes(button, modal, {
          'data-assessment-question-id': 'input[name="unsafe_assessment_question_id"]',
        });
        $(modal).modal('show');
      }
    }),
  );
});
