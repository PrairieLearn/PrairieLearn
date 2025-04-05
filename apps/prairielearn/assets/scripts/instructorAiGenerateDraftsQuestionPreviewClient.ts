import { onDocumentReady } from '@prairielearn/browser-utils';

import {examplePrompts} from '../../src/lib/aiGeneratedQuestionSamples.js'

import { mathjaxTypeset } from './lib/mathjax.js';

interface SampleQuestionVariantInfo {
  question: string;
  correctAnswer: string;
  options?: string[];
}

onDocumentReady(() => {
  const newVariantButton = document.querySelector(
    '#question-preview-new-variant-button',
  ) as HTMLButtonElement;
  const questionPreviewName = document.querySelector(
    '#question-preview-name',
  ) as HTMLParagraphElement;
  const questionContent = document.querySelector(
    '#question-content',
  ) as HTMLDivElement;
  const gradeButton = document.querySelector('#question-preview-grade-button') as HTMLButtonElement;
  const questionUserResponse = document.querySelector(
    '#question-preview-response',
  ) as HTMLInputElement;

  const exampleQuestionSelector = document.querySelector(
    '#example-question-selector',
  ) as HTMLSelectElement;
  const questionPreviewAnswerName = document.querySelector('#question-preview-answer-name') as HTMLSpanElement;
  const questionPreviewAnswerNameContainer = document.querySelector('#question-preview-answer-name-container') as HTMLSpanElement;
  const questionPreviewAnswerUnitsFeedbackContainer = document.querySelector('#grade-answer-units-feedback-container') as HTMLSpanElement;
  const questionPreviewAnswerUnits = document.querySelector('#grade-answer-units') as HTMLSpanElement;
  const questionPreviewAnswerFeedback = document.querySelector('#grade-answer-feedback') as HTMLSpanElement;

  const copyPromptsButton = document.querySelector('#copy-prompts');

  copyPromptsButton?.addEventListener('click', () => {
    function setInputValue(selector: string, value: string) {
      const input = document.querySelector(selector) as HTMLInputElement;
      input.value = value;
    }

    // Find the selected sample question tab
    const selectedTab = exampleQuestionSelector?.querySelector('.active') as HTMLAnchorElement;
    const selection = selectedTab.dataset;;

    // Set the prompt input values based on the selected question tab
    setInputValue('#user-prompt-llm', selection.promptGeneral ?? '');
    setInputValue('#user-prompt-llm-user-input', selection.promptUserInput ?? '');
    setInputValue('#user-prompt-llm-grading', selection.promptGrading ?? '');
  });

  function setGrade(state: 'correct' | 'incorrect' | 'no-grade') {
    switch (state) {
      case 'correct':
        questionPreviewAnswerUnitsFeedbackContainer.className = 'input-group-text';
        if (questionPreviewAnswerUnits.innerHTML !== '') {
          questionPreviewAnswerUnits.className = 'me-2';
        }
        questionPreviewAnswerFeedback.className = 'badge bg-success';
        questionPreviewAnswerFeedback.textContent = '100%';
        break;
      case 'incorrect':
        questionPreviewAnswerUnitsFeedbackContainer.className = 'input-group-text';
        if (questionPreviewAnswerUnits.innerHTML !== '') {
          questionPreviewAnswerUnits.className = 'me-2';
        }
        questionPreviewAnswerFeedback.className = 'badge bg-danger';
        questionPreviewAnswerFeedback.textContent = '0%';
        break;
      case 'no-grade':
        questionPreviewAnswerFeedback.className = 'input-group-text d-none';
        questionPreviewAnswerUnits.className = '';
        
    }
  }

  function setTextValue(selector: string, value: string) {
    const input = document.querySelector(selector) as HTMLInputElement;
    // There is an em within the input. Find it
    const em = input.querySelector('em');
    if (em) {
      em.innerHTML = value;
    }
  }

  function generateSampleQuestionVariant(id: string) {
    let variant: SampleQuestionVariantInfo;
    switch (id) {
      case 'dot-product':
        variant = generateDotProductVariant();
        break;
      case 'median':
        variant = generateMedianVariant();
        break;
      case 'bst':
        variant = generateBSTVariant();
        break;
      case 'bit-shifting':
        variant = generateBitShiftingVariant();
        break;
      case 'projectile-distance':
        variant = generateProjectileDistanceVariant();
        break;
      default:
        variant = {
          question: '',
          correctAnswer: '',
        };
    }

    console.log('variant', variant);

    // Clear the user response field
    questionUserResponse.value = '';

    // Set the question content to that of the variant
    questionContent.innerHTML = variant.question;

    // Store the answer in the grade button
    gradeButton.dataset.answer = variant.correctAnswer;

    setGrade('no-grade');

    // Update the examples
    const examplePrompt = examplePrompts.find((examplePrompt) => examplePrompt.id === id);
    if (examplePrompt) {
      // Set question preview name
      questionPreviewName.innerHTML = examplePrompt.name;

      // Update the answer name
      if (examplePrompt.answerName) {
        questionPreviewAnswerNameContainer.className = 'input-group-text';
        questionPreviewAnswerName.innerHTML = `${examplePrompt.answerName} = `;
      } else {
        questionPreviewAnswerNameContainer.className = 'input-group-text d-none';
        questionPreviewAnswerName.innerHTML = '';
      }

      // Update the answer units
      if (examplePrompt.answerUnits) {
        questionPreviewAnswerUnitsFeedbackContainer.className = 'input-group-text';
        questionPreviewAnswerUnits.innerHTML = examplePrompt.answerUnits;
      } else {
        questionPreviewAnswerUnitsFeedbackContainer.className = 'input-group-text d-none';
        questionPreviewAnswerUnits.innerHTML = '';
      }
 
      setTextValue('#user-prompt-llm-example', `Example: ${examplePrompt.promptGeneral ?? ''}`);
      setTextValue(
        '#user-prompt-llm-user-input-example',
        `Example: ${examplePrompt.promptUserInput ?? ''}`,
      );
      setTextValue(
        '#user-prompt-llm-grading-example',
        `Example: ${examplePrompt.promptGrading ?? ''}`,
      );
    }
    mathjaxTypeset();
  }

  // Generate the initial variant when the page loads
  generateSampleQuestionVariant('dot-product');

  // Generate a new variant when the new variant button is clicked
  newVariantButton?.addEventListener('click', () => {
    const selectedTab = exampleQuestionSelector?.querySelector('.active') as HTMLAnchorElement;
    if (selectedTab.dataset.id) {
      generateSampleQuestionVariant(selectedTab.dataset.id);
    }
  });

  // Generate a new variant when the example question tab is changed
  exampleQuestionSelector?.addEventListener('shown.bs.tab', (event) => {
    const newTab = event.target as HTMLAnchorElement;
    const selection = newTab.dataset;
    if (selection.id) {
      generateSampleQuestionVariant(selection.id);
    }
  });

  // Grade the question when the grade button is clicked
  gradeButton?.addEventListener('click', () => {
    const selectedTab = exampleQuestionSelector?.querySelector('.active') as HTMLAnchorElement;
    if (selectedTab.dataset.id) {
      const response = questionUserResponse.value;
      const answer = gradeButton.dataset.answer;

      console.log('response', response, answer);

      if (response === answer) {
        setGrade('correct');
      } else {
        setGrade('incorrect');
      }
    }
  });
});

function generateDotProductVariant(): SampleQuestionVariantInfo {
  const vector1 = {
    x: Math.floor(Math.random() * 10),
    y: Math.floor(Math.random() * 10),
    z: Math.floor(Math.random() * 10),
  };
  const vector2 = {
    x: Math.floor(Math.random() * 10),
    y: Math.floor(Math.random() * 10),
    z: Math.floor(Math.random() * 10),
  };

  const dotProduct = vector1.x * vector2.x + vector1.y * vector2.y + vector1.z * vector2.z;

  return {
    question: `
<p>
    Given two vectors:
</p>
<p>
  $
  \\mathbf{u} = \\begin{bmatrix} ${vector1.x} \\\\ ${vector1.y} \\\\ ${vector1.z} \\end{bmatrix}

  \\quad \\text{and} \\quad

  \\mathbf{v} = \\begin{bmatrix} ${vector2.x} \\\\ ${vector2.y} \\\\ ${vector2.z} \\end{bmatrix}
  $
</p>
<p>
    Calculate the dot product $ \\mathbf{u} \\cdot \\mathbf{v} $.
</p>`,
    correctAnswer: dotProduct.toString(),
  };
}

function generateMedianVariant(): SampleQuestionVariantInfo {
  // The number of items in the list, between 5 and 10
  const numberOfItems = Math.floor(Math.random() * 5) + 5;

  const randomArray = Array.from({ length: numberOfItems }, () => Math.floor(Math.random() * 100));

  const sortedArray = randomArray.sort((a, b) => a - b);  
  const middleIndex = Math.floor(sortedArray.length / 2);
  let median;
  if (sortedArray.length % 2 === 0) {
    median = (sortedArray[middleIndex - 1] + sortedArray[middleIndex]) / 2;
  } else {
    median = sortedArray[middleIndex];
  }

  return {
    question: `
        <p>
            Select the median of the following numbers: ${randomArray.map((num) => num.toString()).join(', ')}
        </p>
        `,
    correctAnswer: median.toString(),
  };
}

function generateBitShiftingVariant(): SampleQuestionVariantInfo {
  // The length of the bit string, between 3 and 7
  const bitLength = Math.floor(Math.random() * 5) + 3;

  // Randomly generated bit string of length bitLength
  const bitString = Math.floor(Math.random() * Math.pow(2, bitLength));

  // Random number between 1 and bitLength-1, inclusive
  const shiftAmount = Math.floor(Math.random() * (bitLength - 1)) + 1;
  const shiftedNumber = bitString << shiftAmount;

  const numPositions = shiftAmount === 1 ? '1 position' : `${shiftAmount} positions`;

  return {
    question: `
            <p>
                You are given the bit string: <code>${bitString.toString(2).padStart(bitLength, '0')}</code>.
            </p>
            <p>
                Perform a logical left shift by ${numPositions} on the bit string.
            </p>
        `,
    correctAnswer: shiftedNumber
      .toString(2)
      .padStart(bitLength, '0')
      .slice(shiftAmount, shiftAmount + bitLength),
  };
}

function generateProjectileDistanceVariant(): SampleQuestionVariantInfo {
  // Initial velocity is between 10 and 20 m/s
  const initialVelocity = Math.floor(Math.random() * 10) + 10;

  // Launch angle is between 30 and 60 degrees
  const launchAngle = Math.floor(Math.random() * 30) + 30;

  // Acceleration due to gravity in m/s^2
  const gravity = 9.81;

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

  const launchAngleRounded = Math.round(launchAngle * 100) / 100;
  const initialVelocityRounded = Math.round(initialVelocity * 100) / 100;
  const horizontalDisplacementRounded = Math.round(horizontalDisplacement * 100) / 100;
  

  return {
    question: `
            <p>
                A projectile is launched at an angle of $ ${launchAngleRounded}^{\\circ} $ with an initial velocity of $ ${initialVelocityRounded} $ m/s. Assuming no wind resistance, calculate how far the projectile will travel horizontally.
            </p>
        `,
    correctAnswer: horizontalDisplacementRounded.toString(),
  };
}
