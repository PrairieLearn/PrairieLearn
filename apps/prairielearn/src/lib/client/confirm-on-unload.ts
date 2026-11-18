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

/** Call from a `beforeunload` handler that would otherwise ask for confirmation. */
export function consumeSkippedFormConfirmation(): boolean {
  const skipped = skipNextConfirmation;
  skipNextConfirmation = false; // Reset in case navigation doesn't happen
  return skipped;
}

function skippedFieldsFromForm(form: HTMLFormElement): Set<string> {
  return new Set([
    '__csrf_token',
    '__variant_id',
    ...Array.from(
      form.querySelectorAll<HTMLInputElement>('[data-skip-unload-check]'),
      (input) => input.name,
    ).filter(Boolean),
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

/** Maintains the saved form state that unsaved answers are compared against. */
function watchSavedQuestionFormData(form: HTMLFormElement, onSave: () => void): () => void {
  // Set form state on load. Use timeout of zero to trigger this change in the
  // next event cycle. This ensures any initialization code done by elements is
  // executed before saving the data.
  const initialTimeoutId = setTimeout(() => {
    saveQuestionFormData(form);
    onSave();
  }, 0);

  // Set form state on submit, since in this case the "unsaved" data is being saved
  const handleSubmit = () => {
    saveQuestionFormData(form);
    onSave();
  };
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
      onSave();
    });
    observer.observe(input, { attributes: true, attributeFilter: ['value'] });
    observers.push(observer);
  });

  return () => {
    clearTimeout(initialTimeoutId);
    form.removeEventListener('submit', handleSubmit);
    observers.forEach((observer) => observer.disconnect());
  };
}

export function confirmOnUnload(form: HTMLFormElement): () => void {
  const stopWatching = watchSavedQuestionFormData(form, () => {});

  // Check form state on unload
  const handleBeforeUnload = (event: BeforeUnloadEvent) => {
    // Skip confirmation if explicitly requested (e.g., during intentional form submission)
    if (consumeSkippedFormConfirmation()) return;

    const isSameForm = form.dataset.originalFormData === getQuestionFormData(form);

    if (!isSameForm) {
      // Best practice per MDN is to call preventDefault() and set returnValue for legacy support.
      // Safari on iOS does not support confirmation on beforeunload at all.
      // https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event#compatibility_notes
      event.preventDefault();
      // oxlint-disable-next-line typescript/no-deprecated -- https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event#usage_notes
      event.returnValue = 'prompt';
    }
  };
  window.addEventListener('beforeunload', handleBeforeUnload);

  return () => {
    stopWatching();
    window.removeEventListener('beforeunload', handleBeforeUnload);
  };
}

/**
 * Reports whether the form has unsaved answers whenever that changes. Unlike
 * `confirmOnUnload`, this does not wait for the page to unload: an application
 * page cannot synchronously ask a question in another document, and Safari does
 * not show unload prompts from cross-origin frames.
 */
export function trackQuestionFormChanges(
  form: HTMLFormElement,
  onChange: (dirty: boolean) => void,
): () => void {
  let dirty = false;
  let pendingCheck: ReturnType<typeof setTimeout> | undefined;
  const observer = new MutationObserver(() => scheduleCheck());

  function check() {
    pendingCheck = undefined;
    if (form.dataset.originalFormData === undefined) return;
    const changed = form.dataset.originalFormData !== getQuestionFormData(form);
    // Building form data runs `formdata` handlers, which may set the inputs they
    // update. Those changes must not schedule another check.
    observer.takeRecords();
    if (changed !== dirty) {
      dirty = changed;
      onChange(dirty);
    }
  }

  // Elements may update their inputs after the event that changed the answer,
  // so check in a later task. Repeated changes in one task share a check.
  function scheduleCheck() {
    pendingCheck ??= setTimeout(check, 0);
  }

  const stopWatching = watchSavedQuestionFormData(form, scheduleCheck);
  const events = ['input', 'change', 'keyup', 'pointerup', 'drop'];
  events.forEach((type) => form.addEventListener(type, scheduleCheck, { capture: true }));
  // Elements often store answers in hidden inputs, whose `value` property is
  // reflected to the attribute, and may add inputs after initialization.
  observer.observe(form, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['value'],
  });

  return () => {
    clearTimeout(pendingCheck);
    stopWatching();
    events.forEach((type) => form.removeEventListener(type, scheduleCheck, { capture: true }));
    observer.disconnect();
  };
}
