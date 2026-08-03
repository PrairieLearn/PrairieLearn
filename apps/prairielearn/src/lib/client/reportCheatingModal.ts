export function setupReportCheatingModal() {
  const form = document.querySelector<HTMLFormElement>('.js-report-cheating-form');
  if (!form) return;

  const modal = form.querySelector<HTMLElement>('#reportCheatingModal');
  const fields = form.querySelector<HTMLElement>('.js-report-cheating-fields');
  const loading = form.querySelector<HTMLElement>('.js-report-cheating-loading');
  const success = form.querySelector<HTMLElement>('.js-report-cheating-success');
  const error = form.querySelector<HTMLElement>('.js-report-cheating-error');
  const cancelButton = form.querySelector<HTMLButtonElement>('.js-report-cheating-cancel');
  const submitButton = form.querySelector<HTMLButtonElement>('.js-report-cheating-submit');
  const submitLabel = form.querySelector<HTMLElement>('.js-report-cheating-submit-label');
  const report = form.querySelector<HTMLTextAreaElement>('textarea[name="report"]');
  const csrfToken = form.querySelector<HTMLInputElement>('input[name="__csrf_token"]');
  const submissionId = form.querySelector<HTMLInputElement>('input[name="submission_id"]');
  let submissionSucceeded = false;
  let submitting = false;
  let submittedReport: string | null = null;

  function rotateSubmissionId() {
    if (submissionId) submissionId.value = crypto.randomUUID();
    submittedReport = null;
  }

  function showForm() {
    fields?.classList.remove('d-none');
    loading?.classList.add('d-none');
    success?.classList.add('d-none');
    error?.classList.add('d-none');
    submitButton?.classList.remove('d-none');
    submitButton?.removeAttribute('disabled');
    cancelButton?.removeAttribute('disabled');
    if (cancelButton) cancelButton.textContent = 'Cancel';
    if (submitLabel) submitLabel.textContent = 'Submit report';
  }

  function showLoading() {
    fields?.classList.add('d-none');
    success?.classList.add('d-none');
    error?.classList.add('d-none');
    loading?.classList.remove('d-none');
    submitButton?.setAttribute('disabled', 'true');
    cancelButton?.setAttribute('disabled', 'true');
  }

  function showError(message: string) {
    fields?.classList.remove('d-none');
    loading?.classList.add('d-none');
    success?.classList.add('d-none');
    if (error) {
      error.textContent = message;
      error.classList.remove('d-none');
    }
    submitButton?.removeAttribute('disabled');
    cancelButton?.removeAttribute('disabled');
    if (submitLabel) submitLabel.textContent = 'Try again';
  }

  function showSuccess(message: string) {
    fields?.classList.add('d-none');
    loading?.classList.add('d-none');
    error?.classList.add('d-none');
    if (success) {
      success.textContent = message;
      success.classList.remove('d-none');
    }
    submitButton?.classList.add('d-none');
    cancelButton?.removeAttribute('disabled');
    if (cancelButton) cancelButton.textContent = 'Close';
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submitting) return;

    submitting = true;
    submittedReport = report?.value ?? null;
    showLoading();

    try {
      const response = await fetch(form.action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          __csrf_token: csrfToken?.value,
          report: report?.value,
          submission_id: submissionId?.value,
        }),
        redirect: 'error',
      });
      const result: unknown = await response.json();
      if (typeof result !== 'object' || result === null) {
        throw new Error('Invalid report response');
      }
      if (response.ok && 'message' in result && typeof result.message === 'string') {
        submitting = false;
        submissionSucceeded = true;
        showSuccess(result.message);
      } else if (!response.ok && 'error' in result && typeof result.error === 'string') {
        submitting = false;
        showError(result.error);
      } else {
        throw new Error('Invalid report response');
      }
    } catch {
      submitting = false;
      showError(
        'We could not confirm whether your report was submitted. Please try again, or tell your proctor directly.',
      );
    }
  });

  report?.addEventListener('input', () => {
    if (submittedReport !== null && report.value !== submittedReport) {
      rotateSubmissionId();
    }
  });

  modal?.addEventListener('show.bs.modal', showForm);
  modal?.addEventListener('hide.bs.modal', (event) => {
    if (submitting) event.preventDefault();
  });
  modal?.addEventListener('hidden.bs.modal', () => {
    if (!submissionSucceeded) return;
    form.reset();
    rotateSubmissionId();
    submissionSucceeded = false;
    showForm();
  });
}
