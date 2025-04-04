import { observe } from 'selector-observer';

import { onDocumentReady } from '@prairielearn/browser-utils';

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

  const questionPreviewTitle = document.querySelector('#question-preview-title') as HTMLInputElement;
  const gradeButton = document.querySelector('#grade-button') as HTMLButtonElement;
  const questionUserResponse = document.querySelector('#question-user-response') as HTMLInputElement;
  const gradeResponse = document.querySelector('#grade-response') as HTMLSpanElement;

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
      gradeButton.dataset.answer = dotProduct.toString();

      gradeResponse.className = 'input-group-text d-none';
      questionUserResponse.value = '';
    } else if (id === 'select-median-of-random-numbers') {
      const numberOfResponses = Math.floor(Math.random() * 5) + 5; // Random number between 5 and 10
      const randomArray = Array.from({ length: numberOfResponses }, () => Math.floor(Math.random() * 100));

      questionPreviewTitle.innerHTML = `
  <p>
      Select the median of the following numbers: ${randomArray.map((num) => num.toString()).join(', ')}
  </p>
      `;
      // Sort the array
      const sortedArray = randomArray.sort((a, b) => a - b);
      // Calculate the median
      const middleIndex = Math.floor(sortedArray.length / 2);
      let median;
      if (sortedArray.length % 2 === 0) {
        median = (sortedArray[middleIndex - 1] + sortedArray[middleIndex]) / 2;
      } else {
        median = sortedArray[middleIndex];
      }

      // Store the answer in the grade button
      gradeButton.dataset.answer = median.toString();
      gradeResponse.className = 'input-group-text d-none';
      questionUserResponse.value = '';
    } else if (id === 'properties-of-binary-search-tree') {
      
      return;
      
    } else if (id === 'bit-shifting')  {
      const bitLength = Math.floor(Math.random() * 5) + 3; // Random number between 3 and 7

      const randomNumber = Math.floor(Math.random() * Math.pow(2, bitLength));
      // Random number between 1 and bitLength (exclusive)
      const shiftAmount = Math.floor(Math.random() * (bitLength - 1)) + 1;
      const shiftedNumber = randomNumber << shiftAmount;

      const numPositions = shiftAmount === 1 ? '1 position' : `${shiftAmount} positions`;

      questionPreviewTitle.innerHTML = `
      <p>
        You are given the bit string: ${randomNumber.toString(2).padStart(bitLength, '0')}.
      </p>
      <p>
        Perform a logical left shift by ${numPositions} on the bit string.
      </p>
      `

      // Store the answer in the grade button
      gradeButton.dataset.answer = shiftedNumber.toString(2).padStart(bitLength, '0').slice(shiftAmount, shiftAmount + bitLength);
      gradeResponse.className = 'input-group-text d-none';
      questionUserResponse.value = '';
    } else if (id === 'projectile-distance') {
      const initialVelocity = Math.floor(Math.random() * 10) + 10; // Random number between 10 and 20
      const launchAngle = Math.floor(Math.random() * 30) + 30; // Random number between 30 and 60 degrees
      const gravity = 9.81; // Acceleration due to gravity in m/s^2

      // Convert the launch angle from degrees to radians
      const angleInRadians = launchAngle * (Math.PI / 180);

      // Calculate the vertical component of the initial velocity
      const initialVelocityY = initialVelocity * Math.sin(angleInRadians);

      // Compute the time of flight (total time in the air)
      const timeOfFlight = (2 * initialVelocityY) / gravity;

      // Calculate the horizontal component of the initial velocity
      const initialVelocityX = initialVelocity * Math.cos(angleInRadians);

      // Compute the horizontal displacement using the x component and time of flight
      const horizontalDisplacement = initialVelocityX * timeOfFlight;

      questionPreviewTitle.innerHTML = `A projectile is launched at an angle of ${launchAngle.toFixed(2)} with an initial velocity of ${initialVelocity.toFixed(2)}
 m/s. Assuming no wind resistance, calculate how far the projectile will travel horizontally.`

      gradeButton.dataset.answer = horizontalDisplacement.toString();

      gradeResponse.className = 'input-group-text d-none';
      questionUserResponse.value = '';

      return;
    }
  }

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