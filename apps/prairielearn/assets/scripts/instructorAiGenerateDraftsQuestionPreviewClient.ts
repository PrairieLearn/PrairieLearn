import { onDocumentReady } from "@prairielearn/browser-utils";
import { examplePrompts } from '../../src/ee/pages/instructorAiGenerateDrafts/instructorAiGenerateDrafts.html.js';

type SampleQuestionVariantInfo = {
    question: string;
    answerName?: string;
    answerUnits?: string;
    correctAnswer: string;
    answerFormat: 'multiple-choice' | 'text';
    options?: string[];
}

onDocumentReady(() => {
  const newVariantButton = document.querySelector('#question-preview-new-variant-button') as HTMLButtonElement;
  const questionPreviewName = document.querySelector('#question-preview-name') as HTMLParagraphElement;
  const questionPreviewTitle = document.querySelector('#question-preview-title') as HTMLInputElement;
  const gradeButton = document.querySelector('#question-preview-grade-button') as HTMLButtonElement;
  const questionUserResponse = document.querySelector('#question-preview-response') as HTMLInputElement;
  const gradeResponse = document.querySelector('#grade-response') as HTMLSpanElement
  const gradeResponseBadge = gradeResponse.querySelector('.badge') as HTMLSpanElement;

  const exampleQuestionSelector = document.querySelector('#example-question-selector') as HTMLSelectElement;

  const copyPromptsButton = document.querySelector('#copy-prompts');

    copyPromptsButton?.addEventListener('click', () => {
      function setInputValue(selector: string, value: string) {
        const input = document.querySelector(selector) as HTMLInputElement;
        input.value = value;
      }
  
      // Find the selected sample question tab
      const selectedTab = exampleQuestionSelector?.querySelector('.active') as HTMLAnchorElement;
      const selection = selectedTab.dataset;

      // Set the preview question name
      questionPreviewName.innerHTML = selection.name ?? '';
      
      // Set the prompt input values based on the selected question tab
      setInputValue('#user-prompt-llm', selection.promptGeneral ?? '');
      setInputValue('#user-prompt-llm-user-input', selection.promptUserInput ?? '');
      setInputValue('#user-prompt-llm-grading', selection.promptGrading ?? '');
    });
  

  function setGrade(state: 'correct' | 'incorrect' | 'no-grade') {
    switch (state) {
        case 'correct':
            gradeResponse.className = 'input-group-text';
            gradeResponseBadge.className = 'badge bg-success';
            gradeResponseBadge.textContent = '100%';
            break;
        case 'incorrect':
            gradeResponse.className = 'input-group-text';
            gradeResponseBadge.className = 'badge bg-danger';
            gradeResponseBadge.textContent = '0%';
            break;
        case 'no-grade':
            gradeResponse.className = 'input-group-text d-none';
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
          answerName: '',
          correctAnswer: '',
          answerFormat: 'multiple-choice',
        };
    }

    // Clear the user response field
    questionUserResponse.value = '';

    // Set the question content to that of the variant
    questionPreviewTitle.value = variant.question;

    // Store the answer in the grade button
    gradeButton.dataset.answer = variant.correctAnswer;

    setGrade('no-grade');

    // Update the examples
    const examplePrompt = examplePrompts.find(examplePrompt => examplePrompt.id === id);
    if (examplePrompt) {
        setTextValue('#user-prompt-llm-example', `Example: ${examplePrompt.promptGeneral ?? ''}`);
        setTextValue('#user-prompt-llm-user-input-example', `Example: ${examplePrompt.promptUserInput ?? ''}`);
        setTextValue('#user-prompt-llm-grading-example', `Example: ${examplePrompt.promptGrading ?? ''}`);
    }
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

  exampleQuestionSelector?.addEventListener('shown.bs.tab', async (event) => {
    const newTab = event.target as HTMLAnchorElement;
    const selection = newTab.dataset;
    if (selection.id) {
        generateSampleQuestionVariant(selection.id);
    }
  });
});

function generateDotProductVariant(): SampleQuestionVariantInfo {
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

    const dotProduct = vector1.x * vector2.x + vector1.y * vector2.y + vector1.z * vector2.z;

    return {
        question: `
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
        `,
        answerName: 'Dot Product',
        correctAnswer: dotProduct.toString(),
        answerFormat: 'text',
    }
  }

  function generateMedianVariant(): SampleQuestionVariantInfo {
    // The number of items in the list, between 5 and 10
    const numberOfItems = Math.floor(Math.random() * 5) + 5; 
    
    const randomArray = Array.from({ length: numberOfItems }, () => Math.floor(Math.random() * 100));

    const sortedArray = randomArray.sort();
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
      answerName: 'Median',
      correctAnswer: median.toString(),
      answerFormat: 'text',
    }
  }

  function generateBSTVariant(): SampleQuestionVariantInfo {
    return {
        question: '',
        answerName: '',
        correctAnswer: '',
        answerFormat: 'multiple-choice',
    }
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
                You are given the bit string: ${bitString.toString(2).padStart(bitLength, '0')}.
            </p>
            <p>
                Perform a logical left shift by ${numPositions} on the bit string.
            </p>
        `,
        answerName: 'Bit String',
        correctAnswer: shiftedNumber.toString(2).padStart(bitLength, '0').slice(shiftAmount, shiftAmount + bitLength),
        answerFormat: 'text',
    }    
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

    return {
        question: `
            <p>
                A projectile is launched at an angle of ${launchAngle.toFixed(2)} with an initial velocity of ${initialVelocity.toFixed(2)} m/s. Assuming no wind resistance, calculate how far the projectile will travel horizontally.
            </p>
        `,
        answerName: 'Horizontal Distance',
        correctAnswer: horizontalDisplacement.toString(),
        answerFormat: 'text',
        answerUnits: 'm',
    }
  }


