import { onDocumentReady, templateFromAttributes } from '@prairielearn/browser-utils';

onDocumentReady(() => {
  $('#grader-assignment-modal').on('show.bs.modal', (e) => {
    const button = (e as any).relatedTarget as HTMLElement;
    const modal = e.target as HTMLElement;

    templateFromAttributes(button, modal, {
      'data-assessment-question-id': 'input[name="unsafe_assessment_question_id"]',
    });
  });
});
