import { onDocumentReady } from '@prairielearn/browser-utils';
import { on } from 'delegated-events';

onDocumentReady(() => {
  // Select the save button and disable it upon page load.
  const saveButton = $('#save-button')[0];
  saveButton.setAttribute('disabled', 'true');

  // Select all inputs so we can call them.
  const inputs = $('input, select');

  // Create a record to track if each value has changed. We are not storing initial values, but rather a boolean to track if the value has changed. This is important so we don't have to read all values for each input on every change event.
  const valueHasChanged: Record<string, boolean> = {};
  inputs.each(function () {
    valueHasChanged[this.id] = false;
  });

  // Create a record to store the default values of select elements. This is because we do not have access to the default value of a select element like we do for an input element.
  const selectDefaultValues: Record<string, any> = {};
  $('select').each(function () {
    selectDefaultValues[this.id] = (this as HTMLInputElement).value;
  });

  // Add event listenerst to inputs. If the value is different from the default value, set valueHasChanged{} to true. If the value is the same as the default value, set valueHasChanged{} to false. Then call checkDifferences() to see if the save button should be enabled.
  on('input', 'input', (e) => {
    if ((e.target as HTMLInputElement).value === (e.target as HTMLInputElement).defaultValue) {
      valueHasChanged[(e.target as HTMLElement).id] = false;
    } else {
      valueHasChanged[(e.target as HTMLElement).id] = true;
    }

    checkDifferences();
  });

  on('change', 'select', (e) => {
    if (
      (e.target as HTMLInputElement).value === selectDefaultValues[(e.target as HTMLElement).id]
    ) {
      valueHasChanged[(e.target as HTMLElement).id] = false;
    } else {
      valueHasChanged[(e.target as HTMLElement).id] = true;
    }

    checkDifferences();
  });

  // Check if any values have changed (as indicated by a 'true' value in valueHasChanged{}). If so, enable the save button and return. If there are no changes, disable the save button.
  function checkDifferences() {
    for (const element in valueHasChanged) {
      if (valueHasChanged[element] === true) {
        saveButton.removeAttribute('disabled');
        return;
      }
    }
    saveButton.setAttribute('disabled', 'true');
  }
});
