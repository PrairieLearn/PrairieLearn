import _ from 'lodash';

import { onDocumentReady } from '@prairielearn/browser-utils';

import { examplePrompts } from '../../src/lib/aiGeneratedQuestionSamples.js';

import { mathjaxTypeset } from './lib/mathjax.js';

interface SampleQuestionVariantInfo {
  question: string;
  options?: string[];
  correctAnswer: string;
}

onDocumentReady(() => {
  const questionDemo = document.querySelector('#question-demo') as HTMLDivElement;

  const questionDemoName = questionDemo.querySelector(
    '#question-demo-name',
  ) as HTMLParagraphElement;

  const featureList = document.querySelector('#feature-list') as HTMLUListElement;

  const sampleQuestionSelector = document.querySelector(
    '#sample-question-selector',
  ) as HTMLDivElement;

  const sampleQuestionSelectorButton = sampleQuestionSelector.querySelector(
    '#sample-question-selector-button',
  ) as HTMLButtonElement;

  const sampleQuestionSelectorButtonText = sampleQuestionSelectorButton.querySelector(
    '#sample-question-selector-button-text',
  ) as HTMLSpanElement;

  const sampleQuestionSelectorDropdownMenu = sampleQuestionSelector.querySelector(
    '.dropdown-menu',
  ) as HTMLSelectElement;

  const previousQuestionButton = document.querySelector(
    '#previous-question-button',
  ) as HTMLButtonElement;

  const nextQuestionButton = document.querySelector('#next-question-button') as HTMLButtonElement;

  const questionContent = questionDemo.querySelector('#question-content') as HTMLDivElement;
  const gradeButton = questionDemo.querySelector('#grade-button') as HTMLButtonElement;
  const userNumberResponse = questionDemo.querySelector(
    '#user-number-response',
  ) as HTMLInputElement;

  const multipleChoiceResponse = questionDemo.querySelector(
    '#multiple-choice-response',
  ) as HTMLDivElement;
  const multipleChoiceResponseOptions = multipleChoiceResponse.querySelector(
    '#multiple-choice-response-options',
  ) as HTMLDivElement;
  const multipleChoiceFeedbackContainer = multipleChoiceResponse.querySelector(
    '#multiple-choice-feedback-container',
  ) as HTMLDivElement;

  const answerLabelContainer = questionDemo.querySelector(
    '#answer-label-container',
  ) as HTMLSpanElement;
  const answerLabel = questionDemo.querySelector('#answer-label') as HTMLSpanElement;

  const answerUnitsFeedbackContainer = questionDemo.querySelector(
    '#answer-units-feedback-container',
  ) as HTMLSpanElement;
  const answerUnits = questionDemo.querySelector('#answer-units') as HTMLSpanElement;
  const answer = questionDemo.querySelector('#answer') as HTMLSpanElement;

  const newVariantButton = questionDemo.querySelector('#new-variant-button') as HTMLButtonElement;

  const fillPromptsButton = document.querySelector('#fill-prompts');

  function getSelectedSampleQuestion(): HTMLAnchorElement | null {
    return sampleQuestionSelector.querySelector('.active') as HTMLAnchorElement;
  }

  // Fill the prompts of the selected question to the prompt input fields
  fillPromptsButton?.addEventListener('click', () => {
    function setInputValue(selector: string, value: string) {
      const input = document.querySelector(selector) as HTMLInputElement;
      input.value = value;
    }

    // Find the selected sample question tab
    const selectedTab = getSelectedSampleQuestion();
    if (!selectedTab) return;
    const id = selectedTab.dataset.id;
    const examplePrompt = examplePrompts.find((examplePrompt) => examplePrompt.id === id);

    // Set the prompt input values based on the selected question tab
    if (examplePrompt) {
      setInputValue('#user-prompt-llm', examplePrompt.promptGeneral ?? '');
      setInputValue('#user-prompt-llm-user-input', examplePrompt.promptUserInput ?? '');
      setInputValue('#user-prompt-llm-grading', examplePrompt.promptGrading ?? '');
    }
  });

  function setGrade(
    state: 'correct' | 'incorrect' | 'no-grade',
    answerType: 'number' | 'radio' | 'checkbox',
  ) {
    const feedbackContainer =
      answerType === 'number' ? answerUnitsFeedbackContainer : multipleChoiceFeedbackContainer;

    switch (state) {
      case 'correct':
        feedbackContainer.classList.add('correct');
        feedbackContainer.classList.remove('incorrect');
        break;
      case 'incorrect':
        feedbackContainer.classList.add('incorrect');
        feedbackContainer.classList.remove('correct');
        break;
      case 'no-grade':
        feedbackContainer.classList.remove('correct');
        feedbackContainer.classList.remove('incorrect');
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
      case 'mcq-test':
        variant = generateMCQTestVariant();
        break;
      case 'checkbox-test':
        variant = generateCheckboxTestVariant();
        break;
      default:
        variant = {
          question: '',
          correctAnswer: '',
        };
    }

    // Clear the user response field
    userNumberResponse.value = '';

    // Set the question content to that of the variant
    questionContent.innerHTML = variant.question;

    // Store the answer in the grade button
    gradeButton.dataset.answer = variant.correctAnswer;

    // Update the examples
    const examplePrompt = examplePrompts.find((examplePrompt) => examplePrompt.id === id);
    if (examplePrompt) {
      // Update the question demo text
      questionDemoName.innerHTML = examplePrompt.name ?? '';

      // Clear the response feedback
      setGrade('no-grade', examplePrompt.answerType);

      // Update the feature list
      featureList.innerHTML = examplePrompt.features.reduce(
        (acc, feature) => `${acc}
<li>${feature}</li>`,
        '',
      );

      if (examplePrompt.answerType === 'number') {
        // Display the numeric input
        const responseContainer = questionDemo.querySelector(
          '#response-container',
        ) as HTMLDivElement;
        responseContainer.classList.remove('multiple-choice');
        responseContainer.classList.add('number');

        // Create the response field placeholder text
        let placeholderText: string = examplePrompt.answerType;

        // Add relative and absolute tolerance if available
        if (examplePrompt.rtol && examplePrompt.atol) {
          placeholderText = `${placeholderText} (rtol=${examplePrompt.rtol}, atol=${examplePrompt.atol})`;
        } else if (examplePrompt.rtol) {
          placeholderText = `${placeholderText} (rtol=${examplePrompt.rtol})`;
        } else if (examplePrompt.atol) {
          placeholderText = `${placeholderText} (atol=${examplePrompt.atol})`;
        }

        // Update the response placeholder text
        userNumberResponse.placeholder = placeholderText;

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

        // Update the text displaying the answer
        answer.innerHTML = `Answer: ${variant.correctAnswer}`;
      } else if (examplePrompt.answerType === 'radio' || examplePrompt.answerType === 'checkbox') {
        // Display the multiple choice input
        const responseContainer = questionDemo.querySelector(
          '#response-container',
        ) as HTMLDivElement;
        responseContainer.classList.remove('number');
        responseContainer.classList.add('multiple-choice');

        // Add the options to the question
        multipleChoiceResponseOptions.innerHTML = (variant.options ?? []).reduce(
          (acc, option, index) => {
            // Create a letter for the option based on its index
            const optionLetter = String.fromCharCode(index + 'a'.charCodeAt(0));
            return `${acc}
              <div class="form-check">
                <input
                  class="form-check-input"
                  type="${examplePrompt.answerType === 'radio' ? 'radio' : 'checkbox'}"
                  name="multiple-choice-response"
                  id="option-${optionLetter}"
                  value="${option}"
                />
                <label class="form-check-label" for="option-${optionLetter}">
                  (${optionLetter}) ${option}
                </label>
              </div>`;
          },
          '',
        );

        if (examplePrompt.answerType === 'radio') {
          // Update the text displaying the answer
          const correctOptionIndex = variant.options?.indexOf(variant.correctAnswer);

          if (correctOptionIndex !== undefined) {
            const correctOptionLetter = String.fromCharCode(correctOptionIndex + 'a'.charCodeAt(0));
            answer.innerHTML = `Answer: (${correctOptionLetter}) ${variant.correctAnswer}`;
          } else {
            answer.innerHTML = `Answer: ${variant.correctAnswer}`;
          }
        } else {
          const correctOptions = variant.correctAnswer.split(',');
          answer.innerHTML = 'Answer:';
          for (const correctOption of correctOptions) {
            const correctOptionIndex = variant.options?.indexOf(correctOption.trim());
            if (correctOptionIndex !== undefined) {
              const correctOptionLetter = String.fromCharCode(
                correctOptionIndex + 'a'.charCodeAt(0),
              );
              answer.innerHTML += ` (${correctOptionLetter}) ${correctOption}`;
            } else {
              answer.innerHTML += ` ${correctOption}`;
            }
          }
        }
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
  newVariantButton.addEventListener('click', () => {
    const selectedTab = getSelectedSampleQuestion();
    if (selectedTab?.dataset?.id) {
      generateSampleQuestionVariant(selectedTab.dataset.id);
    }
  });

  // When a new example question is selected, update the dropdown and
  // generate a new variant.
  sampleQuestionSelectorDropdownMenu.addEventListener('click', (event) => {
    if (event?.target) {
      const selectedTab = event.target as HTMLAnchorElement;
      const selectedId = selectedTab.dataset.id;

      if (selectedId) {
        const previousTab = getSelectedSampleQuestion();
        if (previousTab) {
          previousTab.classList.remove('active');
        }
        selectedTab.classList.add('active');
        sampleQuestionSelectorButtonText.innerHTML = selectedTab.innerHTML;
        generateSampleQuestionVariant(selectedId);
      }
    }
  });

  previousQuestionButton.addEventListener('click', () => {
    const selectedTab = getSelectedSampleQuestion();
    if (!selectedTab) return;

    const selectedTabId = selectedTab.dataset.id;
    const examplePromptIndex = examplePrompts.findIndex(
      (examplePrompt) => examplePrompt.id === selectedTabId,
    );

    if (examplePromptIndex > 0) {
      // Find the example prompt before the current one
      const previousPrompt = examplePrompts[examplePromptIndex - 1];

      // Find its corresponding option
      const previousOption = sampleQuestionSelector.querySelector(
        `#prompt-${previousPrompt.id}`,
      ) as HTMLAnchorElement;

      const previousOptionId = previousOption.dataset.id;

      previousOption.classList.add('active');
      selectedTab.classList.remove('active');

      sampleQuestionSelectorButtonText.innerHTML = previousOption.innerHTML;
      if (previousOptionId) {
        generateSampleQuestionVariant(previousOptionId);
      }
    }
  });

  nextQuestionButton.addEventListener('click', () => {
    const selectedTab = getSelectedSampleQuestion();
    if (!selectedTab) return;

    const selectedTabId = selectedTab.dataset.id;
    const examplePromptIndex = examplePrompts.findIndex(
      (examplePrompt) => examplePrompt.id === selectedTabId,
    );

    if (examplePromptIndex < examplePrompts.length - 1) {
      // Find the example prompt after the current one
      const nextPrompt = examplePrompts[examplePromptIndex + 1];

      // Find its corresponding option
      const nextOption = sampleQuestionSelector.querySelector(
        `#prompt-${nextPrompt.id}`,
      ) as HTMLAnchorElement;

      const nextOptionId = nextOption.dataset.id;

      nextOption.classList.add('active');
      selectedTab.classList.remove('active');

      sampleQuestionSelectorButtonText.innerHTML = nextOption.innerHTML;
      if (nextOptionId) {
        generateSampleQuestionVariant(nextOptionId);
      }
    }
  });

  // Grade the question when the grade button is clicked
  gradeButton?.addEventListener('click', () => {
    const selectedTab = getSelectedSampleQuestion();
    if (!selectedTab) return;

    const answer = gradeButton.dataset.answer;

    const examplePrompt = examplePrompts.find(
      (examplePrompt) => examplePrompt.id === selectedTab.dataset.id,
    );
    if (!examplePrompt) return;

    if (examplePrompt.answerType === 'number') {
      const response = userNumberResponse.value;
      const rtol = examplePrompt.rtol;
      const atol = examplePrompt.atol;
      const answerNum = parseFloat(answer ?? '0');

      if (answerNum) {
        const responseNum = parseFloat(response);
        const relativeError = Math.abs((responseNum - answerNum) / answerNum);
        const absoluteError = Math.abs(responseNum - answerNum);

        const relativeErrorValid = rtol ? relativeError <= rtol : false;
        const absoluteErrorValid = atol ? absoluteError <= atol : false;
        const perfectMatch = response === answer;

        let isValid = perfectMatch;

        if (rtol && atol) {
          isValid = relativeErrorValid && absoluteErrorValid;
        } else if (rtol) {
          isValid = relativeErrorValid;
        } else if (atol) {
          isValid = absoluteErrorValid;
        }

        if (isValid) {
          setGrade('correct', examplePrompt.answerType);
        } else {
          setGrade('incorrect', examplePrompt.answerType);
        }
      }
    } else if (examplePrompt.answerType === 'radio') {
      const selectedOption = multipleChoiceResponseOptions.querySelector(
        'input[type="radio"]:checked',
      ) as HTMLInputElement;
      const selectedValue = selectedOption?.value;
      const correctAnswer = gradeButton.dataset.answer;

      if (selectedValue === correctAnswer) {
        setGrade('correct', examplePrompt.answerType);
      } else {
        setGrade('incorrect', examplePrompt.answerType);
      }
    } else if (examplePrompt.answerType === 'checkbox') {
      const selectedOptions = multipleChoiceResponseOptions.querySelectorAll(
        'input[type="checkbox"]:checked',
      ) as NodeListOf<HTMLInputElement>;
      const selectedValues = new Set(Array.from(selectedOptions).map((option) => option.value));

      const correctAnswer = gradeButton.dataset.answer;
      const correctValues = new Set(correctAnswer?.split(',').map((option) => option.trim()) ?? []);

      // The selected and correct values sets must be equal for a correct answer
      if (_.isEqual(selectedValues, correctValues)) {
        setGrade('correct', examplePrompt.answerType);
      } else {
        setGrade('incorrect', examplePrompt.answerType);
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

function generateMCQTestVariant(): SampleQuestionVariantInfo {
  // Shuffle the options
  const options = ['Berlin', 'Madrid', 'Paris', 'Rome'];
  const shuffledOptions = options.sort(() => Math.random() - 0.5);

  return {
    question: `
            <p>
                What is the capital of France?
            </p>
        `,
    options: shuffledOptions,
    correctAnswer: 'Paris',
  };
}

function generateCheckboxTestVariant(): SampleQuestionVariantInfo {
  // Shuffle the options
  const options = ['Berlin', 'Madrid', 'Paris', 'Rome'];
  const shuffledOptions = options.sort(() => Math.random() - 0.5);

  return {
    question: `
            <p>
                What are the capitals of France and Spain?
            </p>
        `,
    options: shuffledOptions,
    correctAnswer: 'Paris, Madrid',
  };
}
