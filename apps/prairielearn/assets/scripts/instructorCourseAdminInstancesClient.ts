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
      // on the last input of the form
      endAccessDateInput.setCustomValidity('End access date must be after start access date');
    } else {
      endAccessDateInput.setCustomValidity('');
    }
  };
});
