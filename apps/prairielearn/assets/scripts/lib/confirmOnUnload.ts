function getQuestionFormData(form: HTMLFormElement): string {
  // Cast FormData since TS does not support this parameter,
  // see https://github.com/microsoft/TypeScript/issues/30584
  const formData = new URLSearchParams(new FormData(form) as any);
  formData.delete('__csrf_token');
  form.querySelectorAll<HTMLInputElement>('[data-skip-unload-check]').forEach((input) => {
    if (input.name) formData.delete(input.name);
  });
  return formData.toString();
}

export function saveQuestionFormData(form: HTMLFormElement | null) {
  if (form) form.dataset.originalFormData = getQuestionFormData(form);
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
      // event.preventDefault() is used in Safari/Firefox, but not supported by Chrome/Edge/etc.
      // Returning a string is supported in almost all browsers that support beforeunload.
      // Safari on iOS does not support confirmation on beforeunload at all.
      // https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event#compatibility_notes
      event.preventDefault();
      return '';
    }
  });
}
