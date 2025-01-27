import { observe } from 'selector-observer';

import { onDocumentReady } from '@prairielearn/browser-utils';

const LOADING_PHRASES = [
  'Hiring more TAs...',
  'Refining prompts...',
  'Collapsing wave functions...',
  'Randomizing numbers...',
  'Sharpening pencils...',
  'Warming up neural networks...',
  'Optimizing learning curves...',
  'Accessing forbidden knowledge...',
];

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

onDocumentReady(() => {
  const addQuestionCard = document.querySelector('#add-question-card');
  const addQuestionForm = addQuestionCard?.querySelector('form');
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

  addQuestionForm?.addEventListener('submit', () => {
    // Shuffle the loading phrases for a unique order on each page load.
    for (let i = LOADING_PHRASES.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [LOADING_PHRASES[i], LOADING_PHRASES[j]] = [LOADING_PHRASES[j], LOADING_PHRASES[i]];
    }

    let phraseIndex = 0;

    const loadingPhraseContainer = document.querySelector('#loading-phrases') as HTMLElement;

    // eslint-disable-next-line no-floating-promise/no-floating-promise
    (async () => {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        loadingPhraseContainer.textContent = LOADING_PHRASES[phraseIndex];
        phraseIndex = (phraseIndex + 1) % LOADING_PHRASES.length;

        await delay(3000);
      }
    })();
  });

  const userPromptExampleSelect = document.querySelector<HTMLSelectElement>('#user-prompt-example');
  userPromptExampleSelect?.addEventListener('change', () => {
    function setInputValue(selector: string, value: string) {
      const input = document.querySelector(selector) as HTMLInputElement;
      input.value = value;
    }

    const options = userPromptExampleSelect.options;
    const selection = options[options.selectedIndex].dataset;

    setInputValue('#user-prompt-llm', selection.promptGeneral ?? '');
    setInputValue('#user-prompt-llm-user-input', selection.promptUserInput ?? '');
    setInputValue('#user-prompt-llm-grading', selection.promptGrading ?? '');
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
