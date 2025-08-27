import { onDocumentReady } from '@prairielearn/browser-utils';

onDocumentReady(() => {
  const userPromptExampleSelect = document.querySelector<HTMLSelectElement>('#user-prompt-example');
  userPromptExampleSelect?.addEventListener('change', () => {
    function setInputValue(selector: string, value: string) {
      const input = document.querySelector<HTMLInputElement>(selector)!;
      input.value = value;
    }

    const options = userPromptExampleSelect.options;
    const selection = options[options.selectedIndex].dataset;

    setInputValue('#user-prompt-llm', selection.prompt ?? '');
  });
});
