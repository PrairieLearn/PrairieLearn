import { onDocumentReady } from '@prairielearn/browser-utils';

import { examplePrompts } from '../../src/lib/aiGeneratedQuestionSamples.js';

import { mathjaxTypeset } from './lib/mathjax.js';

interface SampleQuestionVariantInfo {
  question: string;
  options?: string[];
  correctAnswer: string;
}

onDocumentReady(() => {
  const questionDemoContainer = document.querySelector(
    '#question-demo-container',
  ) as HTMLDivElement;

  function getSelectedSampleQuestion(): HTMLAnchorElement | null {
    return sampleQuestionSelector.querySelector('.active') as HTMLAnchorElement;
  }

  const fillPromptsButton = document.querySelector('#fill-prompts');

  // Fill the prompt when the button is clicked
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
    }
  });

  const inputFeedbackAndUnitsContainer = questionDemoContainer.querySelector(
    '#input-feedback-and-units-container',
  ) as HTMLSpanElement;

  const multipleChoiceResponse = questionDemoContainer.querySelector(
    '#multiple-choice-response',
  ) as HTMLDivElement;

  const multipleChoiceFeedbackContainer = multipleChoiceResponse.querySelector(
    '#multiple-choice-feedback-container',
  ) as HTMLDivElement;

  const multipleChoicePartiallyCorrectBadge = multipleChoiceFeedbackContainer.querySelector(
    '.feedback-badge-partially-correct',
  ) as HTMLDivElement;

  // Update the grading feedback based on the user's response and type of displayed question
  function setGrade(
    state: 'correct' | 'partially-correct' | 'incorrect' | 'no-grade',
    answerType: 'number' | 'radio' | 'checkbox' | 'string',
    partialCredit?: number,
  ) {
    const feedbackContainer =
      answerType === 'number' || answerType === 'string'
        ? inputFeedbackAndUnitsContainer
        : multipleChoiceFeedbackContainer;

    feedbackContainer.classList.remove('correct');
    feedbackContainer.classList.remove('partially-correct');
    feedbackContainer.classList.remove('incorrect');
    switch (state) {
      case 'correct':
        feedbackContainer.classList.add('correct');
        break;
      case 'partially-correct':
        feedbackContainer.classList.add('partially-correct');
        if (partialCredit) {
          multipleChoicePartiallyCorrectBadge.innerHTML = `${partialCredit}%`;
        }
        break;
      case 'incorrect':
        feedbackContainer.classList.add('incorrect');
        break;
      default:
    }
  }

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

  const questionDemoName = questionDemoContainer.querySelector(
    '#question-demo-name',
  ) as HTMLParagraphElement;
  const featureList = document.querySelector('#feature-list') as HTMLUListElement;
  const questionContent = questionDemoContainer.querySelector(
    '#question-content',
  ) as HTMLDivElement;

  const responseContainer = questionDemoContainer.querySelector(
    '#response-container',
  ) as HTMLDivElement;
  const userInputResponse = questionDemoContainer.querySelector(
    '#user-input-response',
  ) as HTMLInputElement;

  const multipleChoiceResponseOptions = multipleChoiceResponse.querySelector(
    '#multiple-choice-response-options',
  ) as HTMLDivElement;

  const gradeButton = questionDemoContainer.querySelector('#grade-button') as HTMLButtonElement;

  const answerLabelContainer = questionDemoContainer.querySelector(
    '#answer-label-container',
  ) as HTMLSpanElement;
  const answerLabel = questionDemoContainer.querySelector('#answer-label') as HTMLSpanElement;
  const answerUnits = questionDemoContainer.querySelector('#answer-units') as HTMLSpanElement;
  const answer = questionDemoContainer.querySelector('#answer') as HTMLSpanElement;

  const sampleQuestionPrompt = document.querySelector(
    '#sample-question-prompt',
  ) as HTMLParagraphElement;

  function generateSampleQuestionVariant(id: string) {
    let variant: SampleQuestionVariantInfo;
    switch (id) {
      case 'cities-in-random-country':
        variant = citiesInRandomCountryVariant();
        break;
      case 'identify-even-or-odd-numbers':
        variant = identifyEvenOrOddNumbersVariant();
        break;
      case 'convert-radians-to-degrees':
        variant = convertRadiansToDegreesVariant();
        break;
      case 'multiply-two-numbers':
        variant = multiplyTwoNumbersVariant();
        break;
      case 'identify-rainbow-color':
        variant = identifyRainbowColor();
        break;
      case 'identify-nth-planet':
        variant = identifyNthPlanet();
        break;
      case 'verify-compass-direction':
        variant = verifyCompassDirection();
        break;
      case 'compute-polynomial-root':
        variant = computePolynomialRoot();
        break;
      case 'compute-hypotenuse-length':
        variant = computeHypotenuseLength();
        break;
      case 'find-irregular-plural':
        variant = findIrregularPlural();
        break;
      default:
        variant = {
          question: '',
          correctAnswer: '',
        };
    }

    // Clear the user input response field
    userInputResponse.value = '';

    // Set the question content to that of the variant
    questionContent.innerHTML = variant.question;

    // Store the answer in the grade button
    gradeButton.dataset.answer = variant.correctAnswer;

    // Update the examples
    const examplePrompt = examplePrompts.find((examplePrompt) => examplePrompt.id === id);
    if (examplePrompt) {
      // Update the question demo name
      questionDemoName.innerHTML = examplePrompt.name ?? '';

      // Update the sample question prompt
      sampleQuestionPrompt.innerHTML = examplePrompt.promptGeneral ?? '';

      // Clear the response feedback
      setGrade('no-grade', examplePrompt.answerType);

      // Update the feature list
      featureList.innerHTML = examplePrompt.features.reduce(
        (acc, feature) => `${acc}
<li>${feature}</li>`,
        '',
      );

      if (examplePrompt.answerType === 'number' || examplePrompt.answerType === 'string') {
        // Display the input response
        responseContainer.classList.remove('multiple-choice-response');
        responseContainer.classList.add('input-response');

        // Create the response field placeholder text
        let placeholderText: string = examplePrompt.answerType;

        if (examplePrompt.answerType === 'number') {
          // Add relative and absolute tolerance if available
          if (examplePrompt.rtol && examplePrompt.atol) {
            placeholderText = `${placeholderText} (rtol=${examplePrompt.rtol}, atol=${examplePrompt.atol})`;
          } else if (examplePrompt.rtol) {
            placeholderText = `${placeholderText} (rtol=${examplePrompt.rtol})`;
          } else if (examplePrompt.atol) {
            placeholderText = `${placeholderText} (atol=${examplePrompt.atol})`;
          }
        }

        // Update the response placeholder text
        userInputResponse.placeholder = placeholderText;

        // Update the answer label
        if (examplePrompt.answerLabel) {
          answerLabelContainer.classList.remove('d-none');
          answerLabel.innerHTML = examplePrompt.answerLabel;
        } else {
          answerLabelContainer.classList.add('d-none');
          answerLabel.innerHTML = '';
        }

        // Update the answer units
        if (examplePrompt.answerType === 'number' && examplePrompt.answerUnits) {
          inputFeedbackAndUnitsContainer.classList.add('show-units');
          answerUnits.innerHTML = examplePrompt.answerUnits;
        } else {
          inputFeedbackAndUnitsContainer.classList.remove('show-units');
          answerUnits.innerHTML = '';
        }

        // Update the text displaying the answer
        answer.innerHTML = `Answer: ${variant.correctAnswer}`;
      } else if (examplePrompt.answerType === 'radio' || examplePrompt.answerType === 'checkbox') {
        // Display the multiple choice input
        responseContainer.classList.remove('input-response');
        responseContainer.classList.add('multiple-choice-response');

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
                  name="option-${optionLetter}"
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
          answer.innerHTML = 'Answer: ';
          const correctAnswersWithLetters = [];
          for (const correctOption of correctOptions) {
            const correctOptionIndex = variant.options?.indexOf(correctOption.trim());
            if (correctOptionIndex !== undefined) {
              const correctOptionLetter = String.fromCharCode(
                correctOptionIndex + 'a'.charCodeAt(0),
              );
              correctAnswersWithLetters.push(`(${correctOptionLetter}) ${correctOption}`);
            } else {
              correctAnswersWithLetters.push(correctOption);
            }
          }

          // Update the text displaying the answer, sorted by their option letter.
          answer.innerHTML += correctAnswersWithLetters.sort().join(', ');
        }
      }
    }

    // Render the MathJax content
    mathjaxTypeset();
  }

  // Generate the initial variant when the page loads
  generateSampleQuestionVariant(examplePrompts[0].id);

  const newVariantButton = questionDemoContainer.querySelector(
    '#new-variant-button',
  ) as HTMLButtonElement;

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

  const navigateSampleQuestions = (direction: 'previous' | 'next') => {
    const selectedTab = getSelectedSampleQuestion();
    if (!selectedTab) return;

    const selectedTabId = selectedTab.dataset.id;
    const examplePromptIndex = examplePrompts.findIndex(
      (examplePrompt) => examplePrompt.id === selectedTabId,
    );

    if (
      (direction === 'previous' && examplePromptIndex > 0) ||
      (direction === 'next' && examplePromptIndex < examplePrompts.length - 1)
    ) {
      // Find the example prompt in the specified direction
      const targetPrompt = examplePrompts[examplePromptIndex + (direction === 'previous' ? -1 : 1)];

      // Find its corresponding option
      const targetOption = sampleQuestionSelector.querySelector(
        `#prompt-${targetPrompt.id}`,
      ) as HTMLAnchorElement;

      const targetOptionId = targetOption.dataset.id;

      targetOption.classList.add('active');
      selectedTab.classList.remove('active');

      sampleQuestionSelectorButtonText.innerHTML = targetOption.innerHTML;
      if (targetOptionId) {
        generateSampleQuestionVariant(targetOptionId);
      }
    }
  };

  const previousQuestionButton = document.querySelector(
    '#previous-question-button',
  ) as HTMLButtonElement;

  previousQuestionButton.addEventListener('click', () => {
    navigateSampleQuestions('previous');
  });

  const nextQuestionButton = document.querySelector('#next-question-button') as HTMLButtonElement;

  nextQuestionButton.addEventListener('click', () => {
    navigateSampleQuestions('next');
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
      const response = userInputResponse.value;

      const answerNum = parseFloat(answer ?? '0');

      if (isNaN(answerNum)) {
        setGrade('incorrect', examplePrompt.answerType);
        return;
      }

      const responseNum = parseFloat(response);

      const rtol = examplePrompt.rtol;
      const atol = examplePrompt.atol;

      // Do not use relative error if the answer is 0 to avoid division by zero
      const relativeError = answerNum !== 0 ? Math.abs((responseNum - answerNum) / answerNum) : 0;

      const absoluteError = Math.abs(responseNum - answerNum);

      const relativeErrorValid = rtol && answerNum !== 0 ? relativeError <= rtol : false;
      const absoluteErrorValid = atol ? absoluteError <= atol : false;

      // If rtol and atol are both not set, we only check for an exact match
      let isValid = response === answer;

      if (rtol) {
        isValid = isValid || relativeErrorValid;
      }
      if (atol) {
        isValid = isValid || absoluteErrorValid;
      }

      if (isValid) {
        setGrade('correct', examplePrompt.answerType);
      } else {
        setGrade('incorrect', examplePrompt.answerType);
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
      const allOptions = multipleChoiceResponseOptions.querySelectorAll(
        'input[type="checkbox"]',
      ) as NodeListOf<HTMLInputElement>;
      const optionValues = Array.from(allOptions).map((option) => option.value);

      const selectedOptions = multipleChoiceResponseOptions.querySelectorAll(
        'input[type="checkbox"]:checked',
      ) as NodeListOf<HTMLInputElement>;
      const selectedOptionValues = Array.from(selectedOptions).map((option) => option.value);
      const selectedOptionValuesSet = new Set(selectedOptionValues);

      const correctAnswer = gradeButton.dataset.answer;
      const correctValues = correctAnswer?.split(',').map((option) => option.trim()) ?? [];

      const correctValuesSet = new Set(correctValues);

      // Award a point for every correct option selected and incorrect option not selected.
      let numCorrect = 0;
      for (const option of optionValues) {
        if (selectedOptionValuesSet.has(option) === correctValuesSet.has(option)) {
          numCorrect++;
        }
      }

      const percentCorrect = Math.floor((numCorrect / optionValues.length) * 100);

      if (numCorrect === optionValues.length) {
        setGrade('correct', examplePrompt.answerType);
      } else if (numCorrect > 0) {
        setGrade('partially-correct', examplePrompt.answerType, percentCorrect);
      } else {
        setGrade('incorrect', examplePrompt.answerType);
      }
    } else if (examplePrompt.answerType === 'string') {
      const response = userInputResponse.value;
      const correctAnswer = gradeButton.dataset.answer;

      if (response === correctAnswer) {
        setGrade('correct', examplePrompt.answerType);
      } else {
        setGrade('incorrect', examplePrompt.answerType);
      }
    }
  });
});

function citiesInRandomCountryVariant(): SampleQuestionVariantInfo {
  const countries = {
    'the USA': ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix'],
    Canada: ['Toronto', 'Vancouver', 'Montreal', 'Calgary', 'Ottawa'],
    France: ['Paris', 'Lyon', 'Marseille', 'Nice', 'Toulouse'],
    Germany: ['Berlin', 'Munich', 'Hamburg', 'Frankfurt', 'Stuttgart'],
    Japan: ['Tokyo', 'Osaka', 'Kyoto', 'Nagoya', 'Sapporo'],
    Brazil: ['São Paulo', 'Rio de Janeiro', 'Brasília', 'Salvador', 'Fortaleza'],
    Australia: ['Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Adelaide'],
    India: ['Mumbai', 'Delhi', 'Bangalore', 'Chennai', 'Kolkata'],
  };

  const countryNames = Object.keys(countries);
  const randomCountry = countryNames[Math.floor(Math.random() * countryNames.length)];
  const cities = countries[randomCountry as keyof typeof countries];

  // Pick between 1 and 5 correct cities
  const numCorrectCities = Math.floor(Math.random() * 5) + 1;
  const shuffledCorrect = [...cities].sort(() => Math.random() - 0.5);
  const correctCities = shuffledCorrect.slice(0, numCorrectCities);

  // Gather all incorrect cities
  const incorrectCitiesPool: string[] = [];
  for (const country of countryNames) {
    if (country !== randomCountry) {
      incorrectCitiesPool.push(...countries[country as keyof typeof countries]);
    }
  }

  // Shuffle and pick required number of incorrect cities to make 6 total options
  const numIncorrectCities = 6 - numCorrectCities;
  const shuffledIncorrect = incorrectCitiesPool.sort(() => Math.random() - 0.5);
  const selectedIncorrectCities = shuffledIncorrect.slice(0, numIncorrectCities);

  // Combine and shuffle options
  const allOptions = [...correctCities, ...selectedIncorrectCities].sort(() => Math.random() - 0.5);

  const correctAnswer = correctCities.join(', ');

  return {
    question: `
          <p>
              Identify the cities that are in <strong>${randomCountry}</strong>.
          </p>
      `,
    options: allOptions,
    correctAnswer,
  };
}

function identifyEvenOrOddNumbersVariant(): SampleQuestionVariantInfo {
  // Randomly generate 8 integers between 1 and 100
  const numbers = [];
  let startNumber = 0;
  for (let i = 0; i < 8; i++) {
    startNumber += Math.floor(Math.random() * 10) + 1;
    numbers.push(startNumber);
  }

  // Shuffle the numbers
  const shuffledNumbers = numbers.sort(() => Math.random() - 0.5);

  // Randomly select between even and odd
  const isEven = Math.random() < 0.5;
  const correctAnswer = shuffledNumbers
    .filter((num) => (isEven ? num % 2 === 0 : num % 2 !== 0))
    .join(', ');

  return {
    question: `
      <p>
        Select all of the following numbers that are <strong>${isEven ? 'even' : 'odd'}</strong>:
      </p>
    `,
    options: shuffledNumbers.map((number) => number.toString()),
    correctAnswer,
  };
}

function convertRadiansToDegreesVariant(): SampleQuestionVariantInfo {
  // Generate a random numerator and denominator
  const numerator = Math.floor(Math.random() * 10) + 1;
  const denominator = Math.floor(Math.random() * 10) + 2;

  // Randomly generate an angle between 0 and 2 * PI
  const angleInRadians = (numerator / denominator) * Math.PI;

  // Convert radians to degrees
  const angleInDegrees = (angleInRadians * 180) / Math.PI;

  return {
    question: `
      <p>
        Convert the angle $ \\theta = \\frac{${numerator}\\pi}{${denominator}} $ (in radians) to degrees.
      </p>
    `,
    correctAnswer: angleInDegrees.toFixed(2).replace(/\.0+$/, ''),
  };
}

function multiplyTwoNumbersVariant(): SampleQuestionVariantInfo {
  const a = Math.floor(Math.random() * 10) + 1;
  const b = Math.floor(Math.random() * 10) + 1;
  const product = a * b;
  const options = [product];
  while (options.length < 4) {
    const randomOption = Math.floor(Math.random() * 100) + 1;
    if (!options.includes(randomOption)) {
      options.push(randomOption);
    }
  }
  const shuffledOptions = options.sort(() => Math.random() - 0.5);
  const correctAnswer = product.toString();

  return {
    question: `
      <p>
      If $ a = ${a} $ and $ b = ${b} $, what is their product, $ a \\cdot b $?
      </p>
    `,
    options: shuffledOptions.map((option) => option.toString()),
    correctAnswer,
  };
}

function identifyRainbowColor(): SampleQuestionVariantInfo {
  const rainbowColors = ['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Indigo', 'Violet'];
  const nonRainbowColors = ['Copper', 'Brown', 'Gray', 'Black', 'White', 'Gold', 'Cyan'];

  // Select one random correct answer
  const correctAnswer = rainbowColors[Math.floor(Math.random() * rainbowColors.length)];

  // Select 3 random incorrect answers
  const incorrectAnswers = nonRainbowColors.sort(() => Math.random() - 0.5).slice(0, 3);

  return {
    question: `
      <p>
        Which of the following colors can be found in a rainbow?
      </p>
    `,
    options: [correctAnswer, ...incorrectAnswers],
    correctAnswer,
  };
}

function identifyNthPlanet(): SampleQuestionVariantInfo {
  const planets = ['Mercury', 'Venus', 'Earth', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'];
  const randomIndex = Math.floor(Math.random() * planets.length);
  const nthPlanet = planets[randomIndex];
  const otherPlanets = planets.filter((_, index) => index !== randomIndex);
  const shuffledOtherPlanets = otherPlanets.sort(() => Math.random() - 0.5).slice(0, 3);
  const shuffledOptions = [nthPlanet, ...shuffledOtherPlanets].sort(() => Math.random() - 0.5);

  const displayedRandomIndex = randomIndex + 1;

  let indexPostfix = 'th';
  if (displayedRandomIndex === 1) {
    indexPostfix = 'st';
  } else if (displayedRandomIndex === 2) {
    indexPostfix = 'nd';
  } else if (displayedRandomIndex === 3) {
    indexPostfix = 'rd';
  }

  return {
    question: `
      <p>
        Which planet is the ${displayedRandomIndex}${indexPostfix} planet from the sun?
      </p>
    `,
    options: shuffledOptions,
    correctAnswer: nthPlanet,
  };
}

function verifyCompassDirection(): SampleQuestionVariantInfo {
  const european_countries_and_relative_directions = [
    { country1: 'Italy', country2: 'Switzerland', direction: 'North' },
    { country1: 'Spain', country2: 'Portugal', direction: 'West' },
    { country1: 'Norway', country2: 'Sweden', direction: 'South' },
    { country1: 'Finland', country2: 'Estonia', direction: 'South' },
    { country1: 'Austria', country2: 'Czech Republic', direction: 'North' },
    { country1: 'Belgium', country2: 'Netherlands', direction: 'North' },
    { country1: 'Greece', country2: 'Turkey', direction: 'East' },
    { country1: 'Ireland', country2: 'United Kingdom', direction: 'East' },
    { country1: 'Denmark', country2: 'Germany', direction: 'South' },
    { country1: 'Switzerland', country2: 'Austria', direction: 'North' },
    { country1: 'Hungary', country2: 'Slovakia', direction: 'North' },
    { country1: 'Croatia', country2: 'Serbia', direction: 'East' },
    { country1: 'Finland', country2: 'Norway', direction: 'West' },
  ];

  const randomIndex = Math.floor(Math.random() * european_countries_and_relative_directions.length);

  // Randomly select two countries and the direction between them
  const { country1, country2, direction } = european_countries_and_relative_directions[randomIndex];

  const displayCorrectStatement = Math.random() < 0.5;

  const incorrectDirections = ['North', 'South', 'East', 'West'].filter((d) => d !== direction);
  const randomIncorrectDirection =
    incorrectDirections[Math.floor(Math.random() * incorrectDirections.length)];

  return {
    question: `
      <p>
        Is the direction from ${country1} to ${country2} ${displayCorrectStatement ? direction : randomIncorrectDirection}?
      </p>
    `,
    options: ['True', 'False'],
    correctAnswer: displayCorrectStatement ? 'True' : 'False',
  };
}

function computePolynomialRoot(): SampleQuestionVariantInfo {
  let a = 0;
  let b = 0;
  let c = 0;
  let discriminant = -1;

  // Keep generating random coefficients until we get real roots
  let i = 0;
  while (i < 1000 && discriminant < 0) {
    a = Math.round((Math.random() * 4 + 1) * 100) / 100;
    b = Math.round((Math.random() * 20 - 10) * 100) / 100;
    c = Math.round((Math.random() * 20 - 10) * 100) / 100;
    discriminant = b * b - 4 * a * c;
    i++;
  }

  // If we fail to find real roots after 1000 tries, we set a specific case
  if (i === 1000) {
    a = 1;
    b = 1;
    c = 0;
    discriminant = 1;
  }

  // Compute the roots
  const sqrtD = Math.sqrt(discriminant);
  const root1 = Math.round(((-b - sqrtD) / (2 * a)) * 100) / 100;
  const root2 = Math.round(((-b + sqrtD) / (2 * a)) * 100) / 100;

  return {
    question: `
      <p>
        Compute the smallest root of the following polynomial:

        $$ ${a}x^2 + ${b}x + ${c} = 0 $$
      </p>
    `,
    correctAnswer: Math.min(root1, root2).toString(),
  };
}

function computeHypotenuseLength(): SampleQuestionVariantInfo {
  // Generate two random legs of a right triangle
  const leg_a = Math.floor(Math.random() * 10) + 1;
  const leg_b = Math.floor(Math.random() * 10) + 1;

  // Compute the hypotenuse using the Pythagorean theorem
  const hypotenuse = Math.sqrt(leg_a ** 2 + leg_b ** 2);
  const hypotenuseRounded = Math.round(hypotenuse * 100) / 100;

  return {
    question: `
      <p>
        You are given the lengths of two legs of a right triangle: $ ${leg_a} $ and $ ${leg_b} $. Use the Pythagorean theorem to find the length of the hypotenuse $ c $. The formula for the hypotenuse is:

        $$ c = \\sqrt{a^2 + b^2} $$

        What is the length of the hypotenuse $ c $?
      </p>
    `,
    correctAnswer: hypotenuseRounded.toString(),
  };
}

function findIrregularPlural(): SampleQuestionVariantInfo {
  const irregularPluralWords = [
    { singular: 'child', plural: 'children' },
    { singular: 'man', plural: 'men' },
    { singular: 'woman', plural: 'women' },
    { singular: 'tooth', plural: 'teeth' },
    { singular: 'foot', plural: 'feet' },
    { singular: 'mouse', plural: 'mice' },
    { singular: 'goose', plural: 'geese' },
    { singular: 'person', plural: 'people' },
    { singular: 'cactus', plural: 'cacti' },
    { singular: 'focus', plural: 'foci' },
    { singular: 'fungus', plural: 'fungi' },
    { singular: 'nucleus', plural: 'nuclei' },
    { singular: 'syllabus', plural: 'syllabi' },
    { singular: 'analysis', plural: 'analyses' },
    { singular: 'diagnosis', plural: 'diagnoses' },
    { singular: 'oasis', plural: 'oases' },
    { singular: 'thesis', plural: 'theses' },
    { singular: 'crisis', plural: 'crises' },
    { singular: 'phenomenon', plural: 'phenomena' },
    { singular: 'criterion', plural: 'criteria' },
    { singular: 'datum', plural: 'data' },
    { singular: 'alumnus', plural: 'alumni' },
    { singular: 'appendix', plural: 'appendices' },
    { singular: 'index', plural: 'indices' },
    { singular: 'matrix', plural: 'matrices' },
    { singular: 'ox', plural: 'oxen' },
    { singular: 'leaf', plural: 'leaves' },
    { singular: 'loaf', plural: 'loaves' },
    { singular: 'knife', plural: 'knives' },
    { singular: 'life', plural: 'lives' },
    { singular: 'wife', plural: 'wives' },
    { singular: 'elf', plural: 'elves' },
    { singular: 'calf', plural: 'calves' },
    { singular: 'half', plural: 'halves' },
    { singular: 'scarf', plural: 'scarves' },
  ];

  // Randomly select one of them
  const randomIndex = Math.floor(Math.random() * irregularPluralWords.length);

  return {
    question: `
      <p>
        What is the plural form of "${irregularPluralWords[randomIndex].singular}"?
      </p>
    `,
    correctAnswer: irregularPluralWords[randomIndex].plural,
  };
}
