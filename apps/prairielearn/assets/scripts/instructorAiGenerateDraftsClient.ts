import { onDocumentReady } from '@prairielearn/browser-utils';

// Import mathjax to set up the custom MathJax configuration before startup.js loads.
// This must happen before MathJax's startup.js script runs.
import './lib/mathjax.js';

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
