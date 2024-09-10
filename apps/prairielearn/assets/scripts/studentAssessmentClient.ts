import { onDocumentReady } from '@prairielearn/browser-utils';

onDocumentReady(() => {
  const pledgeCertifyCheck = document.querySelector<HTMLInputElement>('#certify-pledge');
  const startAssessmentForm = document.querySelector<HTMLFormElement>('#confirm-form');
  const startAssessmentButton =
    startAssessmentForm?.querySelector<HTMLButtonElement>('#start-assessment');

  if (startAssessmentButton && pledgeCertifyCheck) {
    pledgeCertifyCheck.addEventListener('change', () => {
      startAssessmentButton.disabled = !pledgeCertifyCheck.checked;
    });
  }
  if (startAssessmentButton && startAssessmentForm) {
    startAssessmentForm.addEventListener('submit', () => {
      startAssessmentButton.disabled = true;
      startAssessmentButton.innerHTML =
        '<i class="fa fa-sync fa-spin fa-fw"></i> Generating assessment…';
    });
  }
});
