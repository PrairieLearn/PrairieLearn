import { onDocumentReady } from '@prairielearn/browser-utils';

import { examplePrompts } from '../../src/lib/aiGeneratedQuestionSamples.js';

import { mathjaxTypeset } from './lib/mathjax.js';

interface SampleQuestionVariantInfo {
  question: string;
  correctAnswer: string;
}

onDocumentReady(() => {
  const questionDemo = document.querySelector('#question-demo') as HTMLDivElement;

  const sampleQuestionSelector = document.querySelector(
    '#sample-question-selector',
  ) as HTMLSelectElement;

  const questionDemoName = questionDemo.querySelector(
    '#question-demo-name',
  ) as HTMLParagraphElement;
  const questionContent = questionDemo.querySelector('#question-content') as HTMLDivElement;
  const gradeButton = questionDemo.querySelector('#grade-button') as HTMLButtonElement;
  const userResponse = questionDemo.querySelector('#user-response') as HTMLInputElement;

  const answerLabelContainer = questionDemo.querySelector(
    '#answer-label-container',
  ) as HTMLSpanElement;
  const answerLabel = questionDemo.querySelector('#answer-label') as HTMLSpanElement;

  const answerUnitsFeedbackContainer = questionDemo.querySelector(
    '#answer-units-feedback-container',
  ) as HTMLSpanElement;
  const answerUnits = questionDemo.querySelector('#answer-units') as HTMLSpanElement;

  const newVariantButton = questionDemo.querySelector('#new-variant-button') as HTMLButtonElement;

  const copyPromptsButton = document.querySelector('#copy-prompts');

  // When the Copy Prompts button is clicked, copy the prompts of the selected question to the input fields
  copyPromptsButton?.addEventListener('click', () => {
    function setInputValue(selector: string, value: string) {
      const input = document.querySelector(selector) as HTMLInputElement;
      input.value = value;
    }

    // Find the selected sample question tab
    const selectedTab = sampleQuestionSelector?.querySelector('.active') as HTMLAnchorElement;
    const id = selectedTab.dataset.id;
    const examplePrompt = examplePrompts.find((examplePrompt) => examplePrompt.id === id);

    // Set the prompt input values based on the selected question tab
    if (examplePrompt) {
      setInputValue('#user-prompt-llm', examplePrompt.promptGeneral ?? '');
      setInputValue('#user-prompt-llm-user-input', examplePrompt.promptUserInput ?? '');
      setInputValue('#user-prompt-llm-grading', examplePrompt.promptGrading ?? '');
    }
  });

  function setGrade(state: 'correct' | 'incorrect' | 'no-grade') {
    switch (state) {
      case 'correct':
        answerUnitsFeedbackContainer.classList.add('correct');
        answerUnitsFeedbackContainer.classList.remove('incorrect');
        break;
      case 'incorrect':
        answerUnitsFeedbackContainer.classList.add('incorrect');
        answerUnitsFeedbackContainer.classList.remove('correct');
        break;
      case 'no-grade':
        answerUnitsFeedbackContainer.classList.remove('correct');
        answerUnitsFeedbackContainer.classList.remove('incorrect');
    }
  }

  function setEmTagValue(selector: string, value: string) {
    const input = document.querySelector(selector) as HTMLInputElement;
    input.innerHTML = value;
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

    // Clear the user response field
    userResponse.value = '';

    // Set the question content to that of the variant
    questionContent.innerHTML = variant.question;

    // Store the answer in the grade button
    gradeButton.dataset.answer = variant.correctAnswer;

    setGrade('no-grade');

    // Update the examples
    const examplePrompt = examplePrompts.find((examplePrompt) => examplePrompt.id === id);
    if (examplePrompt) {
      questionDemoName.innerHTML = examplePrompt.name;

      // Update the answer label
      if (examplePrompt.answerLabel) {
        answerLabelContainer.classList.remove('d-none');
        answerLabel.innerHTML = `${examplePrompt.answerLabel} = `;
      } else {
        answerLabelContainer.classList.add('d-none');
        answerLabel.innerHTML = '';
      }

      // Update the answer units
      if (examplePrompt.answerUnits) {
        answerUnitsFeedbackContainer.classList.add('show-units');
        answerUnits.innerHTML = examplePrompt.answerUnits;
      } else {
        answerUnitsFeedbackContainer.classList.remove('show-units');
        answerUnits.innerHTML = '';
      }

      setEmTagValue('#user-prompt-llm-example', `Example: ${examplePrompt.promptGeneral ?? ''}`);
      setEmTagValue(
        '#user-prompt-llm-user-input-example',
        `Example: ${examplePrompt.promptUserInput ?? ''}`,
      );
      setEmTagValue(
        '#user-prompt-llm-grading-example',
        `Example: ${examplePrompt.promptGrading ?? ''}`,
      );
    }

    // Render the MathJax content
    mathjaxTypeset();
  }

  // Generate the initial variant when the page loads
  generateSampleQuestionVariant('dot-product');

  // Generate a new variant when the new variant button is clicked
  newVariantButton?.addEventListener('click', () => {
    const selectedTab = sampleQuestionSelector?.querySelector('.active') as HTMLAnchorElement;
    if (selectedTab.dataset.id) {
      generateSampleQuestionVariant(selectedTab.dataset.id);
    }
  });

  // Generate a new variant when the example question tab is changed
  sampleQuestionSelector?.addEventListener('shown.bs.tab', (event) => {
    const newTab = event.target as HTMLAnchorElement;
    const selection = newTab.dataset;
    if (selection.id) {
      generateSampleQuestionVariant(selection.id);
    }
  });

  // Grade the question when the grade button is clicked
  gradeButton?.addEventListener('click', () => {
    const selectedTab = sampleQuestionSelector?.querySelector('.active') as HTMLAnchorElement;
    if (selectedTab.dataset.id) {
      const response = userResponse.value;
      const answer = gradeButton.dataset.answer;

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
  const bitStringBinary = bitString.toString(2).padStart(bitLength, '0');

  // Random number between 1 and bitLength-1, inclusive
  const shiftAmount = Math.floor(Math.random() * (bitLength - 1)) + 1;
  const numPositions = shiftAmount === 1 ? '1 position' : `${shiftAmount} positions`;

  // Perform a logical left shift by slicing off the first shiftAmount bits and appending zeros.
  const shiftedString = bitStringBinary.slice(shiftAmount) + '0'.repeat(shiftAmount);

  return {
    question: `
            <p>
                You are given the bit string: <code>${bitStringBinary}</code>.
            </p>
            <p>
                Perform a logical left shift by ${numPositions} on the bit string.
            </p>
        `,
    correctAnswer: shiftedString,
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
