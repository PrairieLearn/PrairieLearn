import { onDocumentReady } from '@prairielearn/browser-utils';

onDocumentReady(() => {
  const startAccessDateInput = document.querySelector<HTMLInputElement>('#start_access_date');
  const endAccessDateInput = document.querySelector<HTMLInputElement>('#end_access_date');
  const createButton = document.querySelector<HTMLButtonElement>(
    '#add_course_instance_create_button',
  );

  if (!startAccessDateInput || !endAccessDateInput || !createButton) return;

  createButton.onclick = () => {
    // Ensure that the end access date is after the start access date
    const startAccessDate = new Date(startAccessDateInput.value);
    const endAccessDate = new Date(endAccessDateInput.value);

    if (startAccessDate >= endAccessDate) {
      // Set custom validity only on the endAccessDateInput to trigger the error message
      // on the last input of the form instead of the second to last (startAccessDateInput)
      endAccessDateInput.setCustomValidity('End access date must be after start access date');
    } else {
      endAccessDateInput.setCustomValidity('');
    }
  };

  const accessDatesEnabledInput = document.querySelector<HTMLInputElement>('#access_dates_enabled');
  const accessDatesDiv = document.querySelector<HTMLDivElement>('#accessDates');
  const accessDatesEnabledHelpText = document.querySelector<HTMLDivElement>(
    '#access_dates_enabled_help',
  );
  if (!accessDatesEnabledInput || !accessDatesDiv || !accessDatesEnabledHelpText) return;

  accessDatesEnabledInput.onchange = () => {
    const accessDatesEnabled = accessDatesEnabledInput.checked;

    // If access dates are not enabled, disable the inputs; otherwise, enable them
    startAccessDateInput.disabled = !accessDatesEnabled;
    endAccessDateInput.disabled = !accessDatesEnabled;

    // If access dates are not enabled, hide the parent div of the access date inputs; otherwise, show it
    accessDatesDiv.hidden = !accessDatesEnabled;

    //If access dates are enabled, hide the access date checkbox help text; otherwise, show it
    accessDatesEnabledHelpText.hidden = accessDatesEnabled;
  };
});
