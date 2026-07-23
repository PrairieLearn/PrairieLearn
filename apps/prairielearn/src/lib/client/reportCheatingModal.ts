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

    const body = new URLSearchParams();
    new FormData(form).forEach((value, key) => {
      if (typeof value === 'string') body.append(key, value);
    });

    try {
      const response = await fetch(form.action, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body,
        redirect: 'error',
      });
      const result: unknown = await response.json();
      if (
        typeof result !== 'object' ||
        result === null ||
        !('type' in result) ||
        !('message' in result) ||
        typeof result.message !== 'string'
      ) {
        throw new Error('Invalid report response');
      }
      if (response.ok && result.type === 'success') {
        submitting = false;
        submissionSucceeded = true;
        showSuccess(result.message);
      } else {
        submitting = false;
        showError(result.message);
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
