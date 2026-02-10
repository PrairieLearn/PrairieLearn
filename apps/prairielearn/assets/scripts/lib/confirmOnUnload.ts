let skipNextConfirmation = false;

/**
 * Disables the "unsaved changes" confirmation for the next page unload.
 * Call this immediately before intentionally navigating away (e.g., form submission).
 *
 * The flag auto-resets when the `beforeunload` event fires, so:
 * - If navigation succeeds: page unloads, flag doesn't matter
 * - If navigation is cancelled: flag is reset, subsequent attempts show confirmation
 * - If called without navigation: the next unload will skip confirmation once
 */
export function skipNextFormConfirmation(): void {
  skipNextConfirmation = true;
}

function skippedFieldsFromForm(form: HTMLFormElement): Set<string> {
  return new Set([
    '__csrf_token',
    '__variant_id',
    ...Array.from(form.querySelectorAll<HTMLInputElement>('[data-skip-unload-check]'))
      .map((input) => input.name)
      .filter(Boolean),
  ]);
}

function getQuestionFormData(form: HTMLFormElement): string {
  // Cast FormData since TS does not support this parameter,
  // see https://github.com/microsoft/TypeScript/issues/30584
  const formData = new URLSearchParams(new FormData(form) as any);
  skippedFieldsFromForm(form).forEach((field) => formData.delete(field));
  formData.sort(); // Ensure consistent ordering for comparison
  return formData.toString();
}

function saveQuestionFormData(form: HTMLFormElement | null) {
  if (form) form.dataset.originalFormData = getQuestionFormData(form);
}

function updateQuestionFormData(form: HTMLFormElement, input: HTMLInputElement) {
  // If the original form data is not set, the initial update has not occurred yet, so rely on that to retrieve the value.
  if (form.dataset.originalFormData === undefined) return;

  const skippedFields = skippedFieldsFromForm(form);
  const updatedFormData = new URLSearchParams(form.dataset.originalFormData);
  const currentFormData = new FormData(form);

  // Update only the relevant input. Assumes that the input's name is unique in
  // the form. If this input is marked to be skipped, do not update the form
  // data. The value is retrieved from the FormData object, as it may have been
  // changed in the formdata event handler.
  if (!skippedFields.has(input.name) && currentFormData.has(input.name)) {
    updatedFormData.delete(input.name);
    updatedFormData.append(input.name, currentFormData.get(input.name)?.toString() ?? '');
  }

  // The deferred initialization may have added new fields to the form, so
  // ensure those are included as well to ensure no problems on unload. Add any
  // fields that were not present in the original form data and are not marked
  // to be skipped.
  currentFormData.forEach((value, key) => {
    if (!updatedFormData.has(key) && !skippedFields.has(key)) {
      updatedFormData.append(key, value.toString());
    }
  });

  updatedFormData.sort(); // Ensure consistent ordering for comparison
  form.dataset.originalFormData = updatedFormData.toString();
}

export function confirmOnUnload(form: HTMLFormElement): () => void {
  // Set form state on load. Use timeout of zero to trigger this change in the
  // next event cycle. This ensures any initialization code done by elements is
  // executed before saving the data.
  const initialTimeoutId = setTimeout(() => saveQuestionFormData(form), 0);

  // Set form state on submit, since in this case the "unsaved" data is being saved
  const handleSubmit = () => saveQuestionFormData(form);
  form.addEventListener('submit', handleSubmit);

  // For elements that have a deferred initialization of their input fields
  // (such as lazy loading or async modules), we need to observe changes to
  // those fields and save the form data once they are initialized. Only the
  // first change is considered initialization.
  //
  // Note that we observe changes to the `value` DOM attribute, not the `value`
  // property (which is what determines the form value). Direct changes to the
  // property are not observable via MutationObserver, however modern browsers
  // will reflect property changes to the attribute in many cases, including the
  // common case of `<input type="hidden">` elements used for deferred
  // initialization. Custom elements also have the option of using
  // `setAttribute` to set the `value` attribute when they initialize their
  // inputs if their specific use-case requires it. See:
  // https://html.spec.whatwg.org/multipage/common-dom-interfaces.html#reflecting-content-attributes-in-idl-attributes
  // https://html.spec.whatwg.org/multipage/input.html#hidden-state-(type=hidden)
  // https://html.spec.whatwg.org/multipage/input.html#dom-input-value-default
  const observers: MutationObserver[] = [];
  form.querySelectorAll<HTMLInputElement>('[data-deferred-initial-value]').forEach((input) => {
    // Elements without a name cannot contribute to form data
    if (!input.name) return;
    const observer = new MutationObserver(() => {
      updateQuestionFormData(form, input);
      observer.disconnect();
    });
    observer.observe(input, { attributes: true, attributeFilter: ['value'] });
    observers.push(observer);
  });

  // Check form state on unload
  const handleBeforeUnload = (event: BeforeUnloadEvent) => {
    // Skip confirmation if explicitly requested (e.g., during intentional form submission)
    if (skipNextConfirmation) {
      skipNextConfirmation = false; // Reset in case navigation doesn't happen
      return;
    }

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
  };
  window.addEventListener('beforeunload', handleBeforeUnload);

  return () => {
    clearTimeout(initialTimeoutId);
    form.removeEventListener('submit', handleSubmit);
    observers.forEach((observer) => observer.disconnect());
    window.removeEventListener('beforeunload', handleBeforeUnload);
  };
}
