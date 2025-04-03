import { observe } from 'selector-observer';

import { onDocumentReady } from '@prairielearn/browser-utils';

function updateSampleQuestionPreview(id: string) {
  
}

onDocumentReady(() => {
  const addQuestionCard = document.querySelector('#add-question-card');
  const hiddenInputsContainer = addQuestionCard?.querySelector('.js-hidden-inputs-container');
  const revealFade = addQuestionCard?.querySelector('.reveal-fade');
  const expandButtonContainer = addQuestionCard?.querySelector('.js-expand-button-container');
  const expandButton = expandButtonContainer?.querySelector('button');

  let formExpanded = false;

  function expandQuestionForm() {
    if (formExpanded) return;

    revealFade?.remove();
    expandButtonContainer?.remove();
    hiddenInputsContainer?.classList?.remove('d-none');

    formExpanded = true;
  }

  addQuestionCard?.addEventListener('focusin', () => {
    expandQuestionForm();
  });

  expandButton?.addEventListener('click', () => {
    expandQuestionForm();
  });

  const copyPromptsButton = document.querySelector('#copy-prompts');
  console.log('copyPromptsButton', copyPromptsButton);
  copyPromptsButton?.addEventListener('click', () => {
    function setInputValue(selector: string, value: string) {
      const input = document.querySelector(selector) as HTMLInputElement;
      input.value = value;
    }

    const selectedTab = userVisualExampleSelect?.querySelector('.active') as HTMLAnchorElement;
    const selection = selectedTab.dataset;

    setInputValue('#user-prompt-llm', selection.promptGeneral ?? '');
    setInputValue('#user-prompt-llm-user-input', selection.promptUserInput ?? '');
    setInputValue('#user-prompt-llm-grading', selection.promptGrading ?? '');
  });

  const userVisualExampleSelect = document.querySelector<HTMLSelectElement>('#user-visual-example-tab');
  userVisualExampleSelect?.addEventListener('shown.bs.tab', (event) => {
    function setTextValue(selector: string, value: string) {
      const input = document.querySelector(selector) as HTMLInputElement;
      // There is an em within the input. Find it
      const em = input.querySelector('em');
      if (em) {
        em.innerHTML = value;
      }

      // Update the sample question: Set the title and options

    }

    const newTab = event.target as HTMLAnchorElement;
    const selection = newTab.dataset;
  
    setTextValue('#user-prompt-llm-example', `Example: ${selection.promptGeneral ?? ''}`);
    setTextValue('#user-prompt-llm-user-input-example', `Example: ${selection.promptUserInput ?? ''}`);
    setTextValue('#user-prompt-llm-grading-example', `Example: ${selection.promptGrading ?? ''}`);
  });
});


function resizeTextarea(textarea: HTMLTextAreaElement) {
  textarea.style.height = 'auto';
  textarea.style.height = textarea.scrollHeight + 'px';
}

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      resizeTextarea(entry.target as HTMLTextAreaElement);
    }
  });
});

observe('.js-textarea-autosize', {
  constructor: HTMLTextAreaElement,
  add(el) {
    resizeTextarea(el);
    el.addEventListener('input', () => resizeTextarea(el));

    // A textarea might not be immediately visible when the page loads. So when
    // that changes, we should recompute the height since it would have had
    // an initial height of 0.
    observer.observe(el);
  },
  remove(el) {
    observer.unobserve(el);
  },
});