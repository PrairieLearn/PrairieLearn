function getQuestionFormData(form: HTMLFormElement): string {
  // Cast FormData since TS does not support this parameter,
  // see https://github.com/microsoft/TypeScript/issues/30584
  const formData = new URLSearchParams(new FormData(form) as any);
  formData.delete('__csrf_token');
  form.querySelectorAll('[data-skip-unload-check]').forEach((input: HTMLInputElement) => {
    if (input.name) formData.delete(input.name);
  });
  return formData.toString();
}

export function saveQuestionFormData(form: HTMLFormElement) {
  if (!form) return;
  form.dataset.originalFormData = getQuestionFormData(form);
}

export function confirmOnUnload(form: HTMLFormElement) {
  // Set form state on load and submit
  saveQuestionFormData(form);
  form.addEventListener('submit', () => {
    saveQuestionFormData(form);
  });

  // Check form state on unload
  window.addEventListener('beforeunload', (event) => {
    const isSameForm = form.dataset.originalFormData === getQuestionFormData(form);

    if (!isSameForm) {
      // Supported in most modern browsers
      event.preventDefault();

      // Fallback for legacy browsers
      event.returnValue = '';
      return '';
    }
  });
}
