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
  // Set form state on load. Use timeout of zero to trigger this change in the
  // next event cycle. This ensures any initialization code done by elements is
  // executed before saving the data.
  setTimeout(() => saveQuestionFormData(form), 0);

  // Set form state on submit, since in this case the "unsaved" data is being saved
  form.addEventListener('submit', () => saveQuestionFormData(form));

  // Check form state on unload
  window.addEventListener('beforeunload', (event) => {
    const isSameForm = form.dataset.originalFormData === getQuestionFormData(form);

    if (!isSameForm) {
      // event.preventDefault() is used in Safari/Firefox, but not supported by Chrome/Edge/etc.
      // Returning a string is supported in almost all browsers that support beforeunload.
      // Newer versions of Chrome/Edge appear to no longer support returning a string,
      // but they do seem to support setting `event.returnValue`.
      // Safari on iOS does not support confirmation on beforeunload at all.
      // https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event#compatibility_notes
      // Note that per the spec, we must technically return a non-empty string,
      // although the contents of the string should always be ignored.
      // https://html.spec.whatwg.org/multipage/browsing-the-web.html#unloading-documents:event-beforeunload
      event.preventDefault();
      event.returnValue = 'prompt';
      return 'prompt';
    }
  });
}
