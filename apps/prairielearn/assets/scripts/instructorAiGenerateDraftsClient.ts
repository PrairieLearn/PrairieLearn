import { observe } from 'selector-observer';

import { onDocumentReady } from '@prairielearn/browser-utils';

function updateSampleQuestionPreview(id: string) {
  if (id === 'dot-product') {
    // Generate the two vectors
    const vector1 = {
      x: Math.floor(Math.random() * 10),
      y: Math.floor(Math.random() * 10),
      z: Math.floor(Math.random() * 10)
    };
    const vector2 = {
      x: Math.floor(Math.random() * 10),
      y: Math.floor(Math.random() * 10),
      z: Math.floor(Math.random() * 10)
    };

    // Compute their dot product
    const dotProduct = vector1.x * vector2.x + vector1.y * vector2.y + vector1.z * vector2.z;

    // Update the title
    const questionPreviewTitle = document.querySelector('#question-preview-title') as HTMLInputElement;

    questionPreviewTitle.innerHTML = `
<p>
  Given two vectors:
</p>
<p>
    u = [${vector1.x}, ${vector1.y}, ${vector1.z}]
</p>
<p>
    v = [${vector2.x}, ${vector2.y}, ${vector2.z}]
</p>
<p>
  Calculate the dot product u • v.
</p>
    `;

    // Store the answer in the grade button

    // TODO: Redundant query selection here. Make this better?
    const gradeButton = document.querySelector('#grade-button') as HTMLButtonElement;
    gradeButton.dataset.answer = dotProduct.toString();

    const questionUserResponse = document.querySelector('#question-user-response') as HTMLInputElement;
    const gradeResponse = document.querySelector('#grade-response') as HTMLSpanElement;

    gradeResponse.className = 'input-group-text d-none';
    questionUserResponse.value = '';
  }
}

function handleGrade() {
  const gradeButton = document.querySelector('#grade-button') as HTMLButtonElement;
  const answer = gradeButton.dataset.answer;
  const questionUserResponse = document.querySelector('#question-user-response') as HTMLInputElement;
  const gradeResponse = document.querySelector('#grade-response') as HTMLSpanElement;
  const gradeResponseBadge = gradeResponse.querySelector('.badge') as HTMLSpanElement;
  
  const responseText = questionUserResponse.value?.toString();

  console.log('answer', answer, 'response text', responseText);

  if (responseText === answer) {
    gradeResponse.className = 'input-group-text';
    gradeResponseBadge.className = 'badge bg-success';
    gradeResponseBadge.textContent = '100%';
  } else {
    gradeResponse.className = 'input-group-text';
    gradeResponseBadge.className = 'badge bg-danger';
    gradeResponseBadge.textContent = '0%';
  }
}

onDocumentReady(() => {
  const addQuestionCard = document.querySelector('#add-question-card');
  const hiddenInputsContainer = addQuestionCard?.querySelector('.js-hidden-inputs-container');
  const revealFade = addQuestionCard?.querySelector('.reveal-fade');
  const expandButtonContainer = addQuestionCard?.querySelector('.js-expand-button-container');
  const expandButton = expandButtonContainer?.querySelector('button');
  const newVariantButton = document.querySelector('#new-variant-button');
  const questionPreviewName = document.querySelector('#question-preview-name');
  const gradeButton = document.querySelector('#grade-button')

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

  newVariantButton?.addEventListener('click', () => {

    const selectedTab = userVisualExampleSelect?.querySelector('.active') as HTMLAnchorElement;
    const selection = selectedTab.dataset;

    if (selection.id) {
      updateSampleQuestionPreview(selection.id);
    }
  });

  const userVisualExampleSelect = document.querySelector<HTMLSelectElement>('#user-visual-example-tab');
  userVisualExampleSelect?.addEventListener('shown.bs.tab', async (event) => {
    function setTextValue(selector: string, value: string) {
      const input = document.querySelector(selector) as HTMLInputElement;
      // There is an em within the input. Find it
      const em = input.querySelector('em');
      if (em) {
        em.innerHTML = value;
      }
    }

    const newTab = event.target as HTMLAnchorElement;
    const selection = newTab.dataset;

    if (questionPreviewName) {
      questionPreviewName.innerHTML = selection.name ?? '';
    }  
  
    setTextValue('#user-prompt-llm-example', `Example: ${selection.promptGeneral ?? ''}`);
    setTextValue('#user-prompt-llm-user-input-example', `Example: ${selection.promptUserInput ?? ''}`);
    setTextValue('#user-prompt-llm-grading-example', `Example: ${selection.promptGrading ?? ''}`);

    console.log('selection.id', selection.id);
    if (selection.id) {
      updateSampleQuestionPreview(selection.id);
    }
  });

  gradeButton?.addEventListener('click', () => {
    handleGrade();
  })
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