export type ExamplePrompt = {
  name: string;
  prompt: string;
  generateVariant: () => SampleQuestionVariant;
} & (
  | {
      answerType: 'radio' | 'checkbox';
    }
  | {
      answerType: 'number';
      /* Numeric tolerances for grading answers */
      rtol?: number;
      atol?: number;
      /* Describes what the question answer is, e.g. dot product or velocity */
      answerLabel: string;
      answerUnits?: string;
    }
  | {
      answerType: 'string';
      /* Describes what the question answer is, e.g. dot product or velocity */
      answerLabel: string;
      answerUnits?: string;
    }
);

export type ExamplePromptWithId = ExamplePrompt & { id: keyof typeof examplePrompts };

export const examplePrompts = {
  'cities-in-random-country': {
    name: 'Identify cities in a random country',
    prompt:
      'Generate a list of cities and countries. Then, randomly select a country, and provide the user with a list of cities that seem like they could be in the country. Make a random number of the options actually correct.',
    answerType: 'checkbox',
    generateVariant: citiesInRandomCountryVariant,
  },
  'identify-even-or-odd-numbers': {
    name: 'Identify even or odd numbers',
    prompt:
      'Generate a random list of 8 integers, and prompt the user to select either even or odd numbers, at random.',
    answerType: 'checkbox',
    generateVariant: identifyEvenOrOddNumbersVariant,
  },
  'convert-radians-to-degrees': {
    name: 'Convert angle in radians to degrees',
    prompt: 'Prompt the user to convert a random angle in radians, in terms of pi, to degrees.',
    answerLabel: '$$ \\theta =$$',
    answerUnits: 'degrees',
    answerType: 'number',
    rtol: 0.01,
    atol: 1e-8,
    generateVariant: convertRadiansToDegreesVariant,
  },
  'multiply-two-numbers': {
    name: 'Multiply two random numbers',
    prompt:
      'Generate two random integers, a and b. Give the user a list of 4 randomly generated options for their product. One should be correct.',
    answerType: 'radio',
    generateVariant: multiplyTwoNumbersVariant,
  },
  'identify-rainbow-color': {
    name: 'Identify the rainbow color',
    prompt:
      'Generate a list of random colors. Ask the user which can be found in a rainbow. One color should be the answer.',
    answerType: 'radio',
    generateVariant: identifyRainbowColor,
  },
  'identify-nth-planet': {
    name: 'Identify the n-th planet away from the sun',
    prompt:
      'Randomly pick a number n between 1 and the number of planets in the solar system. Ask the user which planet is the nth planet away from the sun, providing 4 options, one of which is correct.',
    answerType: 'radio',
    generateVariant: identifyNthPlanet,
  },
  'verify-compass-direction': {
    name: 'Identify the compass direction between two countries',
    prompt:
      'Randomly pick two countries in Europe, and randomly pick a compass direction. Ask the user if the selected direction between the two countries is correct or not. The user should be able to pick between true or false multiple choice options.',
    answerType: 'radio',
    generateVariant: verifyCompassDirection,
  },
  'compute-polynomial-root': {
    name: 'Compute smallest root of a random polynomial',
    prompt:
      'Give the user a random second degree polynomial, and prompt them to respond with its smallest root.',
    answerLabel: 'Smallest root = ',
    answerType: 'number',
    rtol: 0.01,
    atol: 1e-8,
    generateVariant: computePolynomialRoot,
  },
  'compute-hypotenuse-length': {
    name: 'Compute random triangle hypotenuse length',
    prompt:
      'Give the user the length of two legs a and b, each with at most one decimal after the decimal point, and prompt the user to find the length of the hypotenuse. Provide the hypotenuse formula. ',
    answerLabel: '$$ c =$$',
    answerType: 'number',
    rtol: 0.01,
    atol: 1e-8,
    generateVariant: computeHypotenuseLength,
  },
  'find-irregular-plural': {
    name: 'Find the plural form of a random word',
    prompt:
      'Give the user a random word with an irregular plural form in its singular form, and ask them to find its plural form.',
    answerLabel: 'Plural form',
    answerType: 'string',
    generateVariant: findIrregularPlural,
  },
} satisfies Record<string, ExamplePrompt>;

export const examplePromptsArray = Object.entries(examplePrompts).map(([id, prompt]) => ({
  id: id as keyof typeof examplePrompts,
  ...prompt,
})) satisfies ExamplePromptWithId[];

export interface VariantOption {
  letter?: string;
  value: string;
}

// Given a variant option, prepend its option letter (if available) to its value.
// e.g. Provided a variant option with letter 'a' and value 'Blue', this function would return '(a) Blue'
export const variantOptionToString = (option: VariantOption) => {
  return `${option.letter ? `(${option.letter}) ` : ''}${option.value}`;
};

const convertStringListToVariantOptions = (options: string[], includeLetter = true) => {
  const optionsArray = options.map((option) => option.trim());
  return optionsArray.map((option, index) => ({
    letter: includeLetter ? String.fromCharCode(index + 'a'.charCodeAt(0)) : undefined, // a, b, c, ...
    value: option,
  }));
};

const findCorrectVariantOptions = (options: VariantOption[], correctAnswers: string[]) => {
  return options.filter((option) =>
    correctAnswers.map((answer) => answer.trim()).includes(option.value),
  );
};

export type SampleQuestionVariant =
  | {
      answerType: 'checkbox' | 'radio';
      question: string;
      options: VariantOption[];
      correctAnswer: VariantOption[];
    }
  | {
      answerType: 'string';
      question: string;
      correctAnswer: string;
    }
  | {
      answerType: 'number';
      question: string;
      correctAnswer: number;
    };

export function generateSampleQuestionVariant(id: keyof typeof examplePrompts) {
  return examplePrompts[id].generateVariant();
}

function citiesInRandomCountryVariant(): SampleQuestionVariant {
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
  const allOptions = convertStringListToVariantOptions(
    [...correctCities, ...selectedIncorrectCities].sort(() => Math.random() - 0.5),
  );
  const correctOptions = findCorrectVariantOptions(allOptions, correctCities);

  return {
    answerType: 'checkbox',
    question: `Identify the cities that are in **${randomCountry}**.`,
    options: allOptions,
    correctAnswer: correctOptions,
  };
}

function identifyEvenOrOddNumbersVariant(): SampleQuestionVariant {
  // Randomly generate 8 integers between 1 and 100
  const numbers: number[] = [];
  let startNumber = 0;
  for (let i = 0; i < 8; i++) {
    startNumber += Math.floor(Math.random() * 10) + 1;
    numbers.push(startNumber);
  }

  // Shuffle the numbers
  const shuffledNumbers = numbers.sort(() => Math.random() - 0.5);

  // Randomly select between even and odd
  const isEven = Math.random() < 0.5;
  const correctAnswer = shuffledNumbers.filter((num) => (isEven ? num % 2 === 0 : num % 2 !== 0));

  const shuffleNumbersOptions = convertStringListToVariantOptions(
    shuffledNumbers.map((number) => number.toString()),
  );
  const correctAnswerOptions = findCorrectVariantOptions(
    shuffleNumbersOptions,
    correctAnswer.map((number) => number.toString()),
  );

  return {
    answerType: 'checkbox',
    question: `Select all of the following numbers that are **${isEven ? 'even' : 'odd'}**:`,
    options: shuffleNumbersOptions,
    correctAnswer: correctAnswerOptions,
  };
}

function convertRadiansToDegreesVariant(): SampleQuestionVariant {
  // Generate a random numerator and denominator
  const numerator = Math.floor(Math.random() * 10) + 1;
  const denominator = Math.floor(Math.random() * 10) + 2;

  // Randomly generate an angle between 0 and 2 * PI
  const angleInRadians = (numerator / denominator) * Math.PI;

  // Convert radians to degrees
  const angleInDegrees = (angleInRadians * 180) / Math.PI;

  return {
    answerType: 'number',
    question: `Convert the angle $ \\theta = \\frac{${numerator}\\pi}{${denominator}} $ (in radians) to degrees.`,
    correctAnswer: angleInDegrees,
  };
}

function multiplyTwoNumbersVariant(): SampleQuestionVariant {
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
  const shuffledOptions = convertStringListToVariantOptions(
    options.sort(() => Math.random() - 0.5).map((option) => option.toString()),
  );
  const correctOptions = findCorrectVariantOptions(shuffledOptions, [product.toString()]);

  return {
    answerType: 'radio',
    question: `If $ a = ${a} $ and $ b = ${b} $, what is their product, $ a \\cdot b $?`,
    options: shuffledOptions,
    correctAnswer: correctOptions,
  };
}

function identifyRainbowColor(): SampleQuestionVariant {
  const rainbowColors = ['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Indigo', 'Violet'];
  const nonRainbowColors = ['Copper', 'Brown', 'Gray', 'Black', 'White', 'Gold', 'Cyan'];

  // Select one random correct answer
  const correctAnswer = rainbowColors[Math.floor(Math.random() * rainbowColors.length)];

  // Select 3 random incorrect answers
  const incorrectAnswers = nonRainbowColors.sort(() => Math.random() - 0.5).slice(0, 3);

  const options = convertStringListToVariantOptions(
    [correctAnswer, ...incorrectAnswers].sort(() => Math.random() - 0.5),
  );
  const correctOptions = findCorrectVariantOptions(options, [correctAnswer]);

  return {
    answerType: 'radio',
    question: 'Which of the following colors can be found in a rainbow?',
    options,
    correctAnswer: correctOptions,
  };
}

function identifyNthPlanet(): SampleQuestionVariant {
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

  const options = convertStringListToVariantOptions(
    shuffledOptions.map((option) => option.toString()),
  );
  const correctOptions = findCorrectVariantOptions(options, [nthPlanet]);

  return {
    answerType: 'radio',
    question: `Which planet is the ${displayedRandomIndex}${indexPostfix} planet from the sun?`,
    options,
    correctAnswer: correctOptions,
  };
}

function verifyCompassDirection(): SampleQuestionVariant {
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

  const options = convertStringListToVariantOptions(['True', 'False'], false);
  const correctAnswer = findCorrectVariantOptions(options, [
    displayCorrectStatement ? 'True' : 'False',
  ]);

  return {
    answerType: 'radio',
    question: `Is the direction from ${country1} to ${country2} ${displayCorrectStatement ? direction : randomIncorrectDirection}?`,
    options,
    correctAnswer,
  };
}

function computePolynomialRoot(): SampleQuestionVariant {
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
    answerType: 'number',
    question: `
        Compute the smallest root of the following polynomial:

        $$ ${a}x^2 + ${b}x + ${c} = 0 $$
      `,
    correctAnswer: Math.min(root1, root2),
  };
}

function computeHypotenuseLength(): SampleQuestionVariant {
  // Generate two random legs of a right triangle
  const leg_a = Math.floor(Math.random() * 10) + 1;
  const leg_b = Math.floor(Math.random() * 10) + 1;

  // Compute the hypotenuse using the Pythagorean theorem
  const hypotenuse = Math.sqrt(leg_a ** 2 + leg_b ** 2);

  return {
    answerType: 'number',
    question: `
        You are given the lengths of two legs of a right triangle: $ ${leg_a} $ and $ ${leg_b} $. Use the Pythagorean theorem to find the length of the hypotenuse $ c $. The formula for the hypotenuse is:

        $$ c = \\sqrt{a^2 + b^2} $$

        What is the length of the hypotenuse $ c $?
      `,
    correctAnswer: hypotenuse,
  };
}

function findIrregularPlural(): SampleQuestionVariant {
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
    answerType: 'string',
    question: `What is the plural form of "${irregularPluralWords[randomIndex].singular}"?`,
    correctAnswer: irregularPluralWords[randomIndex].plural,
  };
}
