import AccordionOriginal from 'react-bootstrap/Accordion';
import AccordionItemOriginal from 'react-bootstrap/AccordionItem';
import AccordionHeaderOriginal from 'react-bootstrap/AccordionHeader';
import AccordionBodyOriginal from 'react-bootstrap/AccordionBody';
import ButtonOriginal from 'react-bootstrap/Button';
import DropdownOriginal from 'react-bootstrap/Dropdown';
import DropdownToggleOriginal from 'react-bootstrap/DropdownToggle';
import DropdownMenuOriginal from 'react-bootstrap/DropdownMenu';
import DropdownItemOriginal from 'react-bootstrap/DropdownItem';

const Accordion = AccordionOriginal as unknown as typeof AccordionOriginal.default;
const AccordionItem = AccordionItemOriginal as unknown as typeof AccordionItemOriginal.default;
const AccordionHeader = AccordionHeaderOriginal as unknown as typeof AccordionHeaderOriginal.default;
const AccordionBody = AccordionBodyOriginal as unknown as typeof AccordionBodyOriginal.default;
const Button = ButtonOriginal as unknown as typeof ButtonOriginal.default;
const Dropdown = DropdownOriginal as unknown as typeof DropdownOriginal.default;
const DropdownToggle = DropdownToggleOriginal as unknown as typeof DropdownToggleOriginal.default;
const DropdownMenu = DropdownMenuOriginal as unknown as typeof DropdownMenuOriginal.default;
const DropdownItem = DropdownItemOriginal as unknown as typeof DropdownItemOriginal.default;

import { render, VNode } from '@prairielearn/preact-cjs';
import { useEffect, useMemo, useRef, useState } from '@prairielearn/preact-cjs/hooks';

import { onDocumentReady } from '@prairielearn/browser-utils';

import { ExamplePrompt, examplePrompts } from '../../src/lib/aiGeneratedQuestionSamples.js';

import { mathjaxTypeset } from './lib/mathjax.js';

interface SampleQuestionVariantInfo {
    question: string;
    options?: string[];
    correctAnswer: string;
}

onDocumentReady(() => {
    const sampleQuestions = document.querySelector('#sample-questions') as HTMLElement;
    const startOpen = sampleQuestions.dataset.startOpen === 'true';

    function SampleQuestionDemo(prompt: ExamplePrompt) {
        const [variant, setVariant] = useState<SampleQuestionVariantInfo | null>(null); 
        const [questionContent, setQuestionContent] = useState<VNode | null>(null);
        const [userInputResponse, setUserInputResponse] = useState<undefined>();
        const [grade, setGrade] = useState<number | null>(null);

         const handleGenerateNewVariant = async () => {
            setGrade(null);
            setUserInputResponse(undefined);
            const questionVariant = generateSampleQuestionVariant(prompt.id);
            setVariant(questionVariant);
            const parts = questionVariant.question.split('**') ?? [];

            setQuestionContent(
                <span>
                    {parts.map((part, index) => {
                        if (index % 2 === 0) {
                            return part;
                        } else {
                            return <strong key={index}>{part}</strong>;
                        }
                    })}
                </span>
            );

            // mathjaxTypeset();
        }

        const handleGrade = () => {

            if (!userInputResponse) {
                return;
            }
            
            if (prompt.answerType === 'number') {
                const responseNum = parseFloat(userInputResponse);
                const answerNum = parseFloat(variant?.correctAnswer ?? '0');

                const rtol = prompt.rtol;
                const atol = prompt.atol;

                // Do not use relative error if the answer is 0 to avoid division by zero
                const relativeError = answerNum !== 0 ? Math.abs((responseNum - answerNum) / answerNum) : 0;

                const absoluteError = Math.abs(responseNum - answerNum);

                const relativeErrorValid = rtol && answerNum !== 0 ? relativeError <= rtol : false;
                const absoluteErrorValid = atol ? absoluteError <= atol : false;

                // If rtol and atol are both not set, we only check for an exact match
                let isValid = userInputResponse === variant?.correctAnswer;

                if (rtol) {
                    isValid = isValid || relativeErrorValid;
                }
                if (atol) {
                    isValid = isValid || absoluteErrorValid;
                }

                if (isValid) {
                    setGrade(100);
                } else {
                    setGrade(0);
                }
            } else if (prompt.answerType === 'string') {
                const isValid = userInputResponse === variant?.correctAnswer;
                setGrade(isValid ? 100 : 0);
            }
        }


        useEffect(() => {
            handleGenerateNewVariant();
        }, [prompt.id]);
        return (
            <div id="question-demo-container" class="card shadow mt-3">
                <div class="card-header d-flex align-items-center p-3 gap-3">
                    <p id="question-demo-name" class="mb-0">{prompt.name}</p>
                    <span class="badge rounded-pill bg-success me-3">Try me!</span>
                </div>
                <div class="card-body">         
                    <p>
                        {questionContent}
                    </p>
                    {(prompt.answerType === 'number' || prompt.answerType === "string") && (
                        <span class="input-group">
                            {prompt.answerLabel && (
                                <span class="input-group-text">
                                    {prompt.answerLabel}
                                </span>
                            )}
                            <input
                                value={userInputResponse}
                                type="text"
                                class="form-control"
                                aria-label="Sample question response"
                                onChange={(e) => setUserInputResponse(e.target?.value)}
                            />
                            <span
                                class="input-group-text"
                            >
                                <span>{prompt.answerUnits}</span>
                                <span class="badge bg-success feedback-badge-correct">100%</span>
                                {/* <span class="badge bg-danger feedback-badge-incorrect">0%</span> */}
                            </span>
                        </span>
                    )}
                    {prompt.answerType === 'checkbox' || prompt.answerType === "radio" && (
                        <div>
                            
                        </div>
                    )}
                </div>
                <div class="card-footer d-flex justify-content-end align-items-center gap-2">
                    <p class="my-0"><i>Answer: {variant?.correctAnswer}</i></p>
                    <div class="flex-grow-1"></div>
                    <button onClick={handleGenerateNewVariant} type="button" class="btn btn-primary text-nowrap">
                        New variant
                    </button>
                    <button id="grade-button" type="button" class="btn btn-primary">Grade</button>
                </div>
            </div>
        )

    }
    
    function SampleQuestion() {

        const [selectedQuestionIndex, setSelectedQuestionIndex] = useState(
            0
        );

        const selectedQuestion = useMemo(() => {
            return examplePrompts[selectedQuestionIndex];
        }, [selectedQuestionIndex])

        const handleClickPrevious = () => {
            if (selectedQuestionIndex > 0) {
                setSelectedQuestionIndex(prevIndex => prevIndex - 1);
            }
        }

        const handleClickNext = () => {
            if (selectedQuestionIndex < examplePrompts.length - 1) {
                setSelectedQuestionIndex(prevIndex => prevIndex + 1);
            }
        }

        return (
            <Accordion class="mb-3">
              <AccordionItem eventKey={"0"}> 
                <AccordionHeader>Example questions and prompts</AccordionHeader>
                <AccordionBody>
                    <div class="d-flex align-items-center gap-2">
                        <Dropdown
                            style={{ width: '100%' }}
                            onSelect={(eventKey) =>
                                setSelectedQuestionIndex(Number(eventKey))
                            }
                        >
                            <DropdownToggle
                                as="button"
                                type="button"
                                style={{'width': '100%'}}
                                className="btn dropdown-toggle border border-gray d-flex justify-content-between align-items-center bg-white"
                            >
                                {selectedQuestion.name}
                            </DropdownToggle>
                            <DropdownMenu>
                                <div>
                                    {examplePrompts.map((prompt, index) => (
                                        <DropdownItem 
                                            key={prompt.id} 
                                            active={index === selectedQuestionIndex} 
                                            eventKey={index.toString()}
                                        >
                                            {prompt.name}
                                        </DropdownItem>
                                    ))}
                                </div>
                            </DropdownMenu>
                        </Dropdown>
                        <Button
                            onClick={handleClickPrevious}
                            variant="primary"
                            disabled={selectedQuestionIndex === 0}
                        >
                            Previous
                        </Button>
                        <Button
                            onClick={handleClickNext}
                            variant="primary"
                            disabled={selectedQuestionIndex === examplePrompts.length - 1}
                        >
                            Next
                        </Button>
                    </div>

                    {SampleQuestionDemo(selectedQuestion)}

                    <p class="fw-bold mb-1 mt-3">Question features</p>
                    <ul>
                        {selectedQuestion.features.map((feature, index) => (
                            <li key={`selected-question-${selectedQuestion.id}-${index}`}>{feature}</li>
                        ))}
                    </ul>

                    <p class="fw-bold mb-1 mt-3">Prompt</p>
                    <p>{selectedQuestion.prompt}</p>
                    <button type="button" class="btn btn-primary me-2">
                        <i class="fa fa-clone mr-2" aria-hidden="true"></i>
                        Fill prompt
                    </button>
                </AccordionBody>
              </AccordionItem>
            </Accordion>
        )
    }

    render(
        <SampleQuestion />,
        sampleQuestions
    );
})

// TODO: Consider moving this to a separate file

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
    return variant;
}

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
      question: `Identify the cities that are in **${randomCountry}**.`,
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
      question: `Select all of the following numbers that are **${isEven ? 'even' : 'odd'}**:`,
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
      question: `Convert the angle $ \\theta = \\frac{${numerator}\\pi}{${denominator}} $ (in radians) to degrees.`,
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
      question: `If $ a = ${a} $ and $ b = ${b} $, what is their product, $ a \\cdot b $?`,
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
      question: `Which of the following colors can be found in a rainbow?`,
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
      question: `Which planet is the ${displayedRandomIndex}${indexPostfix} planet from the sun?`,
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
      question: `Is the direction from ${country1} to ${country2} ${displayCorrectStatement ? direction : randomIncorrectDirection}?`,
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
        Compute the smallest root of the following polynomial:

        $$ ${a}x^2 + ${b}x + ${c} = 0 $$
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
        You are given the lengths of two legs of a right triangle: $ ${leg_a} $ and $ ${leg_b} $. Use the Pythagorean theorem to find the length of the hypotenuse $ c $. The formula for the hypotenuse is:

        $$ c = \\sqrt{a^2 + b^2} $$

        What is the length of the hypotenuse $ c $?
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
        What is the plural form of "${irregularPluralWords[randomIndex].singular}"?
      `,
      correctAnswer: irregularPluralWords[randomIndex].plural,
    };
  }
  