import { onDocumentReady, templateFromAttributes } from '@prairielearn/browser-utils';

onDocumentReady(() => {
  $('#resetQuestionVariantsModal').on('show.bs.modal', (e) => {
    const button = (e as any).relatedTarget as HTMLElement;
    const modal = e.target as HTMLElement;

    templateFromAttributes(button, modal, {
      'data-assessment-question-id': '.js-assessment-question-id',
    });
  });

  $('#deleteQuestionModal').on('show.bs.modal', (e) => {
    const button = (e as any).relatedTarget as HTMLElement;
    const modal = e.target as HTMLElement;
    modal.getElementsByClassName('delete-question-modal-qid')[0].textContent =
      'QID:' + button.getAttribute('data-assessment-qid');
    templateFromAttributes(button, modal, {
      'data-assessment-qid': '.js-unsafe_question_qid',
    });
  });
});
