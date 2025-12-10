export function saveButtonEnabling(form: HTMLFormElement, saveButton: HTMLButtonElement) {
  saveButton.setAttribute('disabled', 'true');

  // Create a record to track if each value has changed. We are not storing initial
  // values, but rather a boolean for each input to track if the value has changed.
  // This is important so we don't have to read all values for each input on every
  // change event when we check if there are differences.
  const valueHasChanged: Record<string, boolean> = {};
  form.querySelectorAll('input, select, textarea').forEach((element) => {
    valueHasChanged[element.id] = false;
  });

  // Create a record to store the default values of select elements. This is because
  // we do not have access to the default value of a select element like we do for an
  // input element.
  const selectDefaultValues: Record<string, any> = {};
  form.querySelectorAll('select').forEach((element) => {
    selectDefaultValues[element.id] = Array.from(element.selectedOptions).map(
      (option) => option.value,
    );
  });

  // Add event listeners to inputs. If the value is different from the default value,
  // set valueHasChanged{} to true. If the value is the same as the default value,
  // set valueHasChanged{} to false. Then call checkDifferences() to see if the save
  // button should be enabled.
  form.addEventListener('input', (e) => {
    if (!(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
      return;
    }

    if (
      (e.target instanceof HTMLInputElement &&
        ((e.target.type === 'checkbox' && e.target.checked === e.target.defaultChecked) ||
          (e.target.type !== 'checkbox' && e.target.value === e.target.defaultValue))) ||
      (e.target instanceof HTMLTextAreaElement && e.target.value === e.target.defaultValue)
    ) {
      valueHasChanged[(e.target as HTMLElement).id] = false;
    } else {
      valueHasChanged[(e.target as HTMLElement).id] = true;
    }

    checkDifferences();
  });

  // Similar to the above, but for select elements. The difference here being that
  // select elements do not store the default value so we must store those in
  // `selectDefaultValues` and compare against those.

  form.addEventListener('change', (e) => {
    if (!(e.target instanceof HTMLSelectElement)) return;

    const selectedOptions = Array.from(e.target.selectedOptions).map((option) => option.value);

    valueHasChanged[e.target.id] =
      JSON.stringify(selectedOptions.sort()) !==
      JSON.stringify(selectDefaultValues[e.target.id].sort());

    checkDifferences();
  });

  /**
   * Check if any values have changed, as indicated by a `true` value in `valueHasChanged`.
   * If so, enable the save button and return. If there are no changes, disable the save button.
   */
  function checkDifferences() {
    for (const element in valueHasChanged) {
      if (valueHasChanged[element] === true) {
        saveButton.removeAttribute('disabled');
        return;
      }
    }
    saveButton.setAttribute('disabled', 'true');
  }
}
