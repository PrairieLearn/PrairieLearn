import { onDocumentReady } from '@prairielearn/browser-utils';

onDocumentReady(() => {
  const startAccessDate = document.querySelector<HTMLInputElement>('#start_access_date');
  const endAccessDate = document.querySelector<HTMLInputElement>('#end_access_date');
  if (!startAccessDate || !endAccessDate) return;
  startAccessDate.addEventListener('change', () => {
    endAccessDate.min = startAccessDate.value;
  });
  endAccessDate.addEventListener('change', () => {
    startAccessDate.max = endAccessDate.value;
  });
});
