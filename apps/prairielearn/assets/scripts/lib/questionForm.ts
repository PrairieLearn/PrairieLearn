/** Captures submission fields, including values supplied by elements' `formdata` handlers. */
export function getQuestionFormData(form: HTMLFormElement): FormData {
  return new FormData(form);
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

function serializeQuestionFormData(form: HTMLFormElement): string {
  const formData = new URLSearchParams();
  getQuestionFormData(form).forEach((value, key) => formData.append(key, value.toString()));
  skippedFieldsFromForm(form).forEach((field) => formData.delete(field));
  formData.sort(); // Ensure consistent ordering for comparison
  return formData.toString();
}

export function isQuestionFormDirty(form: HTMLFormElement): boolean {
  return form.dataset.originalFormData !== serializeQuestionFormData(form);
}

function saveQuestionFormData(form: HTMLFormElement) {
  form.dataset.originalFormData = serializeQuestionFormData(form);
}

function updateQuestionFormData(form: HTMLFormElement, input: HTMLInputElement) {
  // If the original form data is not set, the initial update has not occurred yet, so rely on that to retrieve the value.
  if (form.dataset.originalFormData === undefined) return;

  const skippedFields = skippedFieldsFromForm(form);
  const updatedFormData = new URLSearchParams(form.dataset.originalFormData);
  const currentFormData = getQuestionFormData(form);

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

export function initializeQuestionFormState(form: HTMLFormElement): () => void {
  // Capture after elements have run their synchronous initialization code.
  const initialTimeoutId = setTimeout(() => saveQuestionFormData(form), 0);

  const handleSubmit = () => saveQuestionFormData(form);
  form.addEventListener('submit', handleSubmit);

  // Deferred elements signal initialization by setting the value attribute.
  // Update only that field's baseline, so edits to other fields remain dirty.
  const observers: MutationObserver[] = [];
  form.querySelectorAll<HTMLInputElement>('[data-deferred-initial-value]').forEach((input) => {
    if (!input.name) return;
    const observer = new MutationObserver(() => {
      updateQuestionFormData(form, input);
      observer.disconnect();
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
