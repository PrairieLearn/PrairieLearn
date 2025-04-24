import AccordionOriginal from 'react-bootstrap/Accordion';
import AccordionBodyOriginal from 'react-bootstrap/AccordionBody';
import AccordionHeaderOriginal from 'react-bootstrap/AccordionHeader';
import AccordionItemOriginal from 'react-bootstrap/AccordionItem';
import ButtonOriginal from 'react-bootstrap/Button';
import CardOriginal from 'react-bootstrap/Card';
import CardBodyOriginal from 'react-bootstrap/CardBody';
import CardFooterOriginal from 'react-bootstrap/CardFooter';
import CardHeaderOriginal from 'react-bootstrap/CardHeader';
import DropdownOriginal from 'react-bootstrap/Dropdown';
import DropdownItemOriginal from 'react-bootstrap/DropdownItem';
import DropdownMenuOriginal from 'react-bootstrap/DropdownMenu';
import DropdownToggleOriginal from 'react-bootstrap/DropdownToggle';
import FormCheckOriginal from 'react-bootstrap/FormCheck';
import FormControlOriginal from 'react-bootstrap/FormControl';
import InputGroupOriginal from 'react-bootstrap/InputGroup';
import InputGroupTextOriginal from 'react-bootstrap/InputGroupText';

const Accordion = AccordionOriginal as unknown as typeof AccordionOriginal.default;
const AccordionItem = AccordionItemOriginal as unknown as typeof AccordionItemOriginal.default;
const AccordionHeader =
  AccordionHeaderOriginal as unknown as typeof AccordionHeaderOriginal.default;
const AccordionBody = AccordionBodyOriginal as unknown as typeof AccordionBodyOriginal.default;
const Button = ButtonOriginal as unknown as typeof ButtonOriginal.default;
const Card = CardOriginal as unknown as typeof CardOriginal.default;
const CardBody = CardBodyOriginal as unknown as typeof CardBodyOriginal.default;
const CardHeader = CardHeaderOriginal as unknown as typeof CardHeaderOriginal.default;
const CardFooter = CardFooterOriginal as unknown as typeof CardFooterOriginal.default;
const Dropdown = DropdownOriginal as unknown as typeof DropdownOriginal.default;
const DropdownToggle = DropdownToggleOriginal as unknown as typeof DropdownToggleOriginal.default;
const DropdownMenu = DropdownMenuOriginal as unknown as typeof DropdownMenuOriginal.default;
const DropdownItem = DropdownItemOriginal as unknown as typeof DropdownItemOriginal.default;
const FormCheck = FormCheckOriginal as unknown as typeof FormCheckOriginal.default;
const FormControl = FormControlOriginal as unknown as typeof FormControlOriginal.default;
const InputGroup = InputGroupOriginal as unknown as typeof InputGroupOriginal.default;
const InputGroupText = InputGroupTextOriginal as unknown as typeof InputGroupTextOriginal.default;

import { onDocumentReady } from '@prairielearn/browser-utils';
import { type VNode, render } from '@prairielearn/preact-cjs';
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from '@prairielearn/preact-cjs/hooks';
import { run } from '@prairielearn/run';

import { type ExamplePrompt, examplePrompts } from '../../src/lib/aiGeneratedQuestionSamples.js';

import { mathjaxTypeset } from './lib/mathjax.js';

interface VariantOption {
  letter?: string;
  value: string;
}

interface CheckboxOrRadioVariant {
  answerType: 'checkbox' | 'radio';
  question: string;
  options: VariantOption[];
  correctAnswer: VariantOption[];
}

interface StringVariant {
  answerType: 'string';
  question: string;
  correctAnswer: string;
}

interface NumberVariant {
  answerType: 'number';
  question: string;
  correctAnswer: number;
}

type SampleQuestionVariantInfo = CheckboxOrRadioVariant | StringVariant | NumberVariant;

onDocumentReady(() => {
  const sampleQuestions = document.querySelector('#sample-questions') as HTMLElement;
  const startOpen = sampleQuestions.dataset.startOpen === 'true';

  function FeedbackBadge({ grade }: { grade: number }) {
    const badgeType = run(() => {
      if (grade === 100) {
        return 'bg-success';
      } else if (grade > 0) {
        return 'bg-warning';
      } else {
        return 'bg-danger';
      }
    });
    return (
      <span className={`badge ${badgeType}`}>
        {Math.floor(grade)}
        {'%'}
      </span>
    );
  }

  function SampleQuestionDemo({ prompt }: { prompt: ExamplePrompt }) {
    const [variant, setVariant] = useState<SampleQuestionVariantInfo | null>(null);
    const [questionContent, setQuestionContent] = useState<VNode | null>(null);
    const [userInputResponse, setUserInputResponse] = useState('');
    const [grade, setGrade] = useState<number | null>(null);
    const [placeholder, setPlaceholder] = useState('');
    const [answerLabel, setAnswerLabel] = useState<string | null>(null);
    const [selectedOptions, setSelectedOptions] = useState<Set<string>>(() => new Set<string>());

    const handleSelectOption = (option: string) => {
      if (prompt.answerType === 'radio') {
        setSelectedOptions(new Set([option]));
        return;
      }
      setSelectedOptions((prevSelectedOptions) => {
        const newSelectedOptions = new Set(prevSelectedOptions);
        if (newSelectedOptions.has(option)) {
          newSelectedOptions.delete(option);
        } else {
          newSelectedOptions.add(option);
        }
        return newSelectedOptions;
      });
    };

    const handleClearSelectedOptions = () => {
      setSelectedOptions(new Set<string>());
    };

    const handleGenerateNewVariant = async () => {
      // Clear the previous question content
      setQuestionContent(null);

      // TODO: This timeout exists to ensure that unrendered MathJax content is placed into the 
      //       DOM before the mathjaxTypeset is called. Without it, the MathJax content does not update.
      //       However, this timeout causes a flicker when a new question variant is loaded. We need
      //       to find a better solution.
      await new Promise((resolve) => setTimeout(() => resolve(true), 10));

      // Clear the grade shown to the user
      setGrade(null);

      // Clear the user input response
      setUserInputResponse('');

      // Clear the user's selected options
      handleClearSelectedOptions();

      // Generate a new question variant
      const questionVariant = generateSampleQuestionVariant(prompt.id);
      setVariant(questionVariant);

      // Split the question into different parts: regular text, MathJax, and bold text.
      // MathJax is delimited by $$...$$ or $...$ 
      // Bold text is delimited by **...**.
      const questionParts = questionVariant.question
        .split(/(\$\$[\s\S]+?\$\$|\$[\s\S]+?\$|\*\*[\s\S]+?\*\*)/g)
        .filter(Boolean)
        .map((part, index) => ({
          index,
          content: part,
        }));

      setQuestionContent(
        <span>
          {questionParts.map((part) => {
            // Bold text
            if (part.content.startsWith('**') && part.content.endsWith('**')) {
              return <strong key={part.index}>{part.content.slice(2, -2)}</strong>;
            }

            // MathJax 
            if (
              (part.content.startsWith('$$') && part.content.endsWith('$$')) ||
              (part.content.startsWith('$') && part.content.endsWith('$'))
            ) {
              return <span key={part.index}>{part.content}</span>;
            }

            // Regular text
            return <span key={part.index}>{part.content}</span>;
          })}
        </span>,
      );

      let placeholderText: string = questionVariant.answerType;

      if (prompt.answerType === 'number') {
        // Add relative and absolute tolerance if available
        if (prompt.rtol && prompt.atol) {
          placeholderText = `${placeholderText} (rtol=${prompt.rtol}, atol=${prompt.atol})`;
        } else if (prompt.rtol) {
          placeholderText = `${placeholderText} (rtol=${prompt.rtol})`;
        } else if (prompt.atol) {
          placeholderText = `${placeholderText} (atol=${prompt.atol})`;
        }
        setPlaceholder(placeholderText);
      }
    };

    const handleTypesetMathjax = async () => {
      // TODO: This timeout exists to ensure that unrendered MathJax content is placed into the 
      //       DOM before the mathjaxTypeset is called. Without it, the MathJax content does not update.
      //       However, this timeout causes a flicker when a new question variant is loaded. We need
      //       to find a better solution.
      await new Promise((resolve) => {
        setTimeout(() => {
          resolve(true);
        }, 10);
      });
      await mathjaxTypeset();
    };

    // When a new variant is loaded, typeset the MathJax content.
    useLayoutEffect(() => {
      handleTypesetMathjax();
    }, [variant]);

    const handleConvertToOptionText = (option: VariantOption) => {
      return `${option.letter ? `(${option.letter}) ` : ''}${option.value}`;
    };

    const handleGrade = () => {
      if (!variant) {
        return;
      }

      if (variant.answerType === 'number') {
        const responseNum = parseFloat(userInputResponse);

        const rtol = prompt.rtol;
        const atol = prompt.atol;

        // Do not use relative error if the answer is 0 to avoid division by zero
        const relativeError =
          variant.correctAnswer !== 0
            ? Math.abs((responseNum - variant.correctAnswer) / variant.correctAnswer)
            : 0;

        const absoluteError = Math.abs(responseNum - variant.correctAnswer);

        const relativeErrorValid =
          rtol && variant.correctAnswer !== 0 ? relativeError <= rtol : false;
        const absoluteErrorValid = atol ? absoluteError <= atol : false;

        // If rtol and atol are both not set, we only check for an exact match
        let isValid = responseNum === variant.correctAnswer;

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
      } else if (variant.answerType === 'string') {
        const isValid = userInputResponse === variant?.correctAnswer;
        setGrade(isValid ? 100 : 0);
      } else if (variant.answerType === 'radio') {
        const correctAnswer = variant.correctAnswer[0].value;
        const isValid = selectedOptions.has(correctAnswer);
        setGrade(isValid ? 100 : 0);
      } else if (variant.answerType === 'checkbox') {
        // For checkbox grading, every selected correct and unselected incorrect answer counts as 1 point.
        // The final grade is the sum of the points earned divided by the number of options.

        const numCorrectSelectedAnswers = variant.correctAnswer
          .reduce((acc, option) => {
            if (selectedOptions.has(option.value)) {
              return acc + 1;
            }
            return acc;
          }, 0);

        const correctAnswers = new Set(variant.correctAnswer.map((option) => option.value));

        const numCorrectUnselectedAnswers = variant.options.reduce((acc, option) => {
          if (!correctAnswers.has(option.value) && !selectedOptions.has(option.value)) {
            return acc + 1;
          }
          return acc;
        }, 0)

        setGrade(
          100 *
            ((numCorrectSelectedAnswers + numCorrectUnselectedAnswers) / variant.options.length),
        );
      }
    };

    useEffect(() => {
      handleGenerateNewVariant();
    }, [prompt.id]);

    const handleUpdateAnswerLabel = async () => {
      setAnswerLabel(null);
      // TODO: This timeout exists to ensure that unrendered MathJax content is placed into the 
      //       DOM before the mathjaxTypeset is called. Without it, the MathJax content does not update.
      //       However, this timeout causes a flicker when a new question variant is loaded. We need
      //       to find a better solution.
      await new Promise((resolve) => setTimeout(() => resolve(true), 10));
      if (prompt.answerLabel) {
        setAnswerLabel(prompt.answerLabel);
      }
    };

    // The correct answer to the problem, displayed to the user
    const answerText = useMemo(() => {
      if (!variant) {
        return '';
      }
      if (variant.answerType === 'checkbox' || variant.answerType === 'radio') {
        return variant.correctAnswer.map((option) => handleConvertToOptionText(option)).join(', ');
      }
      if (variant.answerType === 'number') {
        // Round the answer to 4 decimal places
        return Math.round(variant.correctAnswer * 1e4) / 1e4;
      }
      {
        return variant.correctAnswer;
      }
    }, [variant]);

    useEffect(() => {
      handleUpdateAnswerLabel();
    }, [prompt.answerLabel]);

    useEffect(() => {
      if (answerLabel) {
        mathjaxTypeset();
      }
    }, [answerLabel]);

    return (
      <Card id="question-demo-card" className="shadow">
        <CardHeader>
          <div className="d-flex align-items-center gap-2">
            <p id="question-demo-name" className="mb-0">
              {prompt.name}
            </p>
            <span className="badge rounded-pill bg-success me-3">Try me!</span>
          </div>
        </CardHeader>
        <CardBody>
          <p>{questionContent}</p>
          {(prompt.answerType === 'number' || prompt.answerType === 'string') && (
            <InputGroup>
              {answerLabel && <InputGroupText id="answer-label">{answerLabel}</InputGroupText>}
              <FormControl
                value={userInputResponse}
                type="text"
                aria-label="Sample question response"
                placeholder={placeholder}
                onChange={(e) => setUserInputResponse(e.currentTarget.value)}
              />
              {(prompt.answerUnits || grade !== null) && (
                <InputGroupText>
                  <span>{prompt.answerUnits}</span>
                  {grade !== null ? <FeedbackBadge grade={grade} /> : <></>}
                </InputGroupText>
              )}
            </InputGroup>
          )}
          {variant && (variant.answerType === 'checkbox' || variant.answerType === 'radio') && (
            <div>
              {variant.options.map((option, index) => (
                <FormCheck
                  key={`option-${option.letter ?? index}`}
                  type={prompt.answerType as 'checkbox' | 'radio'}
                  name={`option-${option.letter ?? index}`}
                  id={`option-${option.letter ?? index}`}
                  label={handleConvertToOptionText(option)}
                  value={option.value}
                  checked={selectedOptions.has(option.value)}
                  onChange={() => handleSelectOption(option.value)}
                />
              ))}
              {grade !== null ? (
                <div className="mt-2">
                  <FeedbackBadge grade={grade} />
                </div>
              ) : (
                <></>
              )}
            </div>
          )}
        </CardBody>
        <CardFooter>
          <div className="d-flex flex-wrap justify-content-end align-items-center gap-2">
            <p className="my-0">
              <i>Answer: {answerText}</i>
            </p>
            <div className="flex-grow-1"></div>
            <div className="d-flex align-items-center gap-2">
              <Button onClick={handleGenerateNewVariant}>
                <span className="text-nowrap">New variant</span>
              </Button>

              <Button onClick={handleGrade}>Grade</Button>
            </div>
          </div>
        </CardFooter>
      </Card>
    );
  }

  function SampleQuestion() {
    const [selectedQuestionIndex, setSelectedQuestionIndex] = useState(0);

    const selectedQuestion = useMemo(() => {
      return examplePrompts[selectedQuestionIndex];
    }, [selectedQuestionIndex]);

    const handleClickPrevious = () => {
      if (selectedQuestionIndex > 0) {
        setSelectedQuestionIndex((prevIndex) => prevIndex - 1);
      }
    };

    const handleClickNext = () => {
      if (selectedQuestionIndex < examplePrompts.length - 1) {
        setSelectedQuestionIndex((prevIndex) => prevIndex + 1);
      }
    };

    const handleFillPrompt = () => {
      const promptTextarea = document.querySelector('#user-prompt-llm') as HTMLTextAreaElement;
      promptTextarea.value = selectedQuestion.prompt;
    };

    return (
      <Accordion className="mb-3" defaultActiveKey={startOpen ? '0' : undefined}>
        <AccordionItem eventKey={'0'}>
          <AccordionHeader>Example questions and prompts</AccordionHeader>
          <AccordionBody>
            <div
              style={{ width: '100%' }}
              className="d-flex align-items-center gap-2 mb-3 flex-wrap"
            >
              <Dropdown
                style={{ flex: 1 }}
                onSelect={(eventKey) => setSelectedQuestionIndex(Number(eventKey))}
              >
                <DropdownToggle
                  as="button"
                  type="button"
                  style={{ width: '100%' }}
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
              <div class="d-flex align-items-center gap-2">
                <Button onClick={handleClickPrevious} disabled={selectedQuestionIndex === 0}>
                  Previous
                </Button>
                <Button
                  onClick={handleClickNext}
                  disabled={selectedQuestionIndex === examplePrompts.length - 1}
                >
                  Next
                </Button>
              </div>
            </div>

            {<SampleQuestionDemo prompt={selectedQuestion} />}

            <p className="fw-bold mb-1 mt-3">Question features</p>
            <ul>
              {selectedQuestion.features.map((feature, index) => (
                <li key={`selected-question-${selectedQuestion.id}-${index}`}>{feature}</li>
              ))}
            </ul>

            <p className="fw-bold mb-1 mt-3">Prompt</p>
            <p>{selectedQuestion.prompt}</p>

            <Button onClick={handleFillPrompt}>
              <i className="fa fa-clone mr-2" aria-hidden="true"></i>
              Fill prompt
            </Button>
          </AccordionBody>
        </AccordionItem>
      </Accordion>
    );
  }

  render(<SampleQuestion />, sampleQuestions);
});

const convertToVariantOptions = (options: string[], includeLetter = true) => {
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
        answerType: 'string',
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
  const allOptions = convertToVariantOptions(
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
  const correctAnswer = shuffledNumbers.filter((num) => (isEven ? num % 2 === 0 : num % 2 !== 0));

  const shuffleNumbersOptions = convertToVariantOptions(
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

function convertRadiansToDegreesVariant(): SampleQuestionVariantInfo {
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
  const shuffledOptions = convertToVariantOptions(
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

function identifyRainbowColor(): SampleQuestionVariantInfo {
  const rainbowColors = ['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Indigo', 'Violet'];
  const nonRainbowColors = ['Copper', 'Brown', 'Gray', 'Black', 'White', 'Gold', 'Cyan'];

  // Select one random correct answer
  const correctAnswer = rainbowColors[Math.floor(Math.random() * rainbowColors.length)];

  // Select 3 random incorrect answers
  const incorrectAnswers = nonRainbowColors.sort(() => Math.random() - 0.5).slice(0, 3);

  const options = convertToVariantOptions(
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

  const options = convertToVariantOptions(shuffledOptions.map((option) => option.toString()));
  const correctOptions = findCorrectVariantOptions(options, [nthPlanet]);

  return {
    answerType: 'radio',
    question: `Which planet is the ${displayedRandomIndex}${indexPostfix} planet from the sun?`,
    options,
    correctAnswer: correctOptions,
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

  const options = convertToVariantOptions(['True', 'False'], false);
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
    answerType: 'number',
    question: `
        Compute the smallest root of the following polynomial:

        $$ ${a}x^2 + ${b}x + ${c} = 0 $$
      `,
    correctAnswer: Math.min(root1, root2),
  };
}

function computeHypotenuseLength(): SampleQuestionVariantInfo {
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
    answerType: 'string',
    question: `
        What is the plural form of "${irregularPluralWords[randomIndex].singular}"?
      `,
    correctAnswer: irregularPluralWords[randomIndex].plural,
  };
}
