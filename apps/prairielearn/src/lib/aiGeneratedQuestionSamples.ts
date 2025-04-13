export interface ExamplePrompt {
  id: string;
  name: string;
  promptGeneral: string;
  features: string[];
  answerType: 'number' | 'radio' | 'checkbox' | 'string';
  /* Describes what the answer of the user is, e.g. dot product or velocity */
  answerLabel?: string;
  answerUnits?: string;
  /* Placeholder text to be displayed in the response input field */
  rtol?: number;
  atol?: number;
}

export const examplePrompts: ExamplePrompt[] = [
  {
    id: 'cities-in-random-country',
    name: 'Identify cities in a random country',
    features: ['Random parameters', 'Checkbox input', 'Multiple correct answers', 'Partial credit'],
    promptGeneral:
      'Generate a list of cities and countries. Then, randomly select a country, and provide the user with a list of cities that seem like they could be in the country. Make a random number of the options actually correct.',
    answerType: 'checkbox',
  },
  {
    id: 'identify-even-or-odd-numbers',
    name: 'Identify even or odd numbers',
    features: ['Random parameters', 'Checkbox input', 'Multiple correct answers', 'Partial credit'],
    promptGeneral:
      'Generate a random list of 8 integers, and prompt the user to select either even or odd numbers, at random.',
    answerType: 'checkbox',
  },
  {
    id: 'convert-radians-to-degrees',
    name: 'Convert angle in radians to degrees',
    features: ['Random parameters', 'Integer input'],
    promptGeneral:
      'Prompt the user to convert a random angle in radians, in terms of pi, to degrees.',
    answerType: 'number',
  },
  {
    id: 'multiply-two-numbers',
    name: 'Multiply two random numbers',
    features: ['Random parameters', 'Multiple choice input', 'Single correct answer'],
    promptGeneral:
      'Generate two random integers, a and b. Give the user a list of 4 randomly generated options for their product. One should be correct.',
    answerType: 'radio',
  },
  {
    id: 'identify-rainbow-color',
    name: 'Identify the rainbow color',
    features: ['Random parameters', 'Multiple choice input', 'Single correct answer'],
    promptGeneral:
      'Generate a list of random colors. Ask the user which can be found in a rainbow. One color should be the answer.',
    answerType: 'radio',
  },
  {
    id: 'identify-nth-planet',
    name: 'Identify the n-th planet away from the sun',
    features: ['Random parameters', 'Multiple choice input', 'Single correct answer'],
    promptGeneral:
      'Randomly pick a number n between 1 and the number of planets in the solar system. Ask the user which planet is the nth planet away from the sun, providing 4 options, one of which is correct.',
    answerType: 'radio',
  },
  {
    id: 'verify-compass-direction',
    name: 'Identify the correct compass direction between two random countries',
    features: ['Random parameters', 'True/false question'],
    promptGeneral:
      'Randomly pick two countries in Europe, and randomly pick a compass direction. Ask the user if the selected direction between the two countries is correct or not. The user should be able to pick between true or false multiple choice options.',
    answerType: 'radio',
  },
  {
    id: 'compute-polynomial-root',
    name: 'Compute smallest root of a random polynomial',
    features: [
      'Random parameters',
      'Number inputs',
      'Single correct answer',
      'Relative and absolute tolerance',
    ],
    promptGeneral:
      'Give the user a random second degree polynomial, and prompt them to respond with its smallest root.',
    answerLabel: 'Smallest root',
    answerType: 'number',
    rtol: 0.01,
    atol: 1e-8,
  },
  {
    id: 'compute-hypotenuse-length',
    name: 'Compute random triangle hypotenuse length',
    features: [
      'Random parameters',
      'Number input',
      'Single correct answer',
      'Relative and absolute tolerance',
    ],
    promptGeneral:
      'Give the user the length of two legs a and b, each with at most one decimal after the decimal point, and prompt the user to find the length of the hypotenuse. Provide the hypotenuse formula. ',
    answerType: 'number',
    rtol: 0.01,
    atol: 1e-8,
  },
  {
    id: 'find-irregular-plural',
    name: 'Find the plural form of a random word',
    features: ['Random parameters', 'String input', 'Single correct answer'],
    promptGeneral:
      'Give the user a random word with an irregular plural form in its singular form, and ask them to find its plural form.',
    answerType: 'string',
  },
];
