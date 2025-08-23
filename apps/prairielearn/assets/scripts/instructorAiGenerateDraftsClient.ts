import { onDocumentReady } from '@prairielearn/browser-utils';

import { assertDefined } from '../../src/lib/types.js';

onDocumentReady(() => {
  const userPromptExampleSelect = document.querySelector<HTMLSelectElement>('#user-prompt-example');
  userPromptExampleSelect?.addEventListener('change', () => {
    function setInputValue(selector: string, value: string) {
      const input = document.querySelector<HTMLInputElement>(selector);
      assertDefined(input);
      input.value = value;
    }

    const options = userPromptExampleSelect.options;
    const selection = options[options.selectedIndex].dataset;

    setInputValue('#user-prompt-llm', selection.prompt ?? '');
  });
});
