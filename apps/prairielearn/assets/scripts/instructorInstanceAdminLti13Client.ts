import { onDocumentReady } from '@prairielearn/browser-utils';

onDocumentReady(() => {
  const selectLti13Instance = document.querySelector<HTMLSelectElement>('#selectLti13Instance');
  const prefix = selectLti13Instance?.dataset?.urlPrefix;

  if (!prefix) return;

  selectLti13Instance?.addEventListener('change', () => {
    const selectedOption = selectLti13Instance?.querySelector<HTMLOptionElement>('option:selected');
    const selectedVal = selectedOption?.value;
    window.location.href = `${prefix}/${selectedVal}`;
  });
});
