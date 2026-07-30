/**
 * Progressive enhancement for the navbar "End exam" modal (rendered by
 * `EndExamControl` in `src/components/Navbar.tsx`). Without this script the
 * modal's form does a native POST to `/pl/end-exam` and the server's response
 * (303 to the LDB close flow, or a 502 error page) drives the page. With it,
 * we keep the student inside the modal: submit via fetch, show an in-flight
 * state, navigate to the close flow on success, and surface an inline retry
 * on failure so they never get bounced to the error page mid-exam.
 */
export function setupEndExamModal() {
  const form = document.querySelector<HTMLFormElement>('.js-end-exam-form');
  if (!form) return;

  const modal = form.querySelector<HTMLElement>('#endExamModal');
  const confirm = form.querySelector<HTMLElement>('.js-end-exam-confirm');
  const loading = form.querySelector<HTMLElement>('.js-end-exam-loading');
  const error = form.querySelector<HTMLElement>('.js-end-exam-error');
  const cancelButton = form.querySelector<HTMLButtonElement>('.js-end-exam-cancel');
  const submitButton = form.querySelector<HTMLButtonElement>('.js-end-exam-submit');
  const submitSpinner = form.querySelector<HTMLElement>('.js-end-exam-submit-spinner');
  const submitLabel = form.querySelector<HTMLElement>('.js-end-exam-submit-label');
  const csrfToken = form.querySelector<HTMLInputElement>('input[name="__csrf_token"]')?.value;

  function showConfirmState() {
    confirm?.classList.remove('d-none');
    loading?.classList.add('d-none');
    error?.classList.add('d-none');
    submitSpinner?.classList.add('d-none');
    if (submitLabel) submitLabel.textContent = 'End exam';
    submitButton?.removeAttribute('disabled');
    cancelButton?.removeAttribute('disabled');
  }

  function showLoadingState() {
    confirm?.classList.add('d-none');
    error?.classList.add('d-none');
    loading?.classList.remove('d-none');
    submitSpinner?.classList.remove('d-none');
    submitButton?.setAttribute('disabled', 'true');
    cancelButton?.setAttribute('disabled', 'true');
  }

  function showErrorState() {
    loading?.classList.add('d-none');
    error?.classList.remove('d-none');
    submitSpinner?.classList.add('d-none');
    if (submitLabel) submitLabel.textContent = 'Try again';
    submitButton?.removeAttribute('disabled');
    cancelButton?.removeAttribute('disabled');
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showLoadingState();

    try {
      const response = await fetch(form.action, {
        method: 'POST',
        headers: csrfToken ? { 'x-csrf-token': csrfToken } : {},
      });
      // A successful end-exam (or no active reservation) responds with a 303
      // redirect into the LDB close flow, which fetch follows. Navigate the
      // top window there to run the exit handshake. Anything else (e.g. the
      // 502 thrown when PrairieTest couldn't end the reservation) keeps the
      // student in LDB with a retryable error.
      if (response.redirected) {
        window.location.assign(response.url);
      } else {
        showErrorState();
      }
    } catch {
      showErrorState();
    }
  });

  // Reset to the confirmation state each time the modal opens so a previous
  // failure doesn't linger into the next attempt.
  modal?.addEventListener('show.bs.modal', showConfirmState);
}
