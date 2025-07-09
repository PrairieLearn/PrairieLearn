import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import ButtonOriginal from 'react-bootstrap/Button';
import CardOriginal from 'react-bootstrap/Card';
import CardBodyOriginal from 'react-bootstrap/CardBody';
import CardFooterOriginal from 'react-bootstrap/CardFooter';
import CardHeaderOriginal from 'react-bootstrap/CardHeader';
import FormCheckOriginal from 'react-bootstrap/FormCheck';
import FormControlOriginal from 'react-bootstrap/FormControl';
import InputGroupOriginal from 'react-bootstrap/InputGroup';
import InputGroupTextOriginal from 'react-bootstrap/InputGroupText';

import { run } from '@prairielearn/run';

import {
  type ExamplePromptWithId,
  type VariantOption,
  generateSampleQuestionVariant,
  variantOptionToString,
} from './aiGeneratedQuestionSamples.js';

const Button = ButtonOriginal as unknown as typeof ButtonOriginal.default;
const Card = CardOriginal as unknown as typeof CardOriginal.default;
const CardBody = CardBodyOriginal as unknown as typeof CardBodyOriginal.default;
const CardHeader = CardHeaderOriginal as unknown as typeof CardHeaderOriginal.default;
const CardFooter = CardFooterOriginal as unknown as typeof CardFooterOriginal.default;
const FormCheck = FormCheckOriginal as unknown as typeof FormCheckOriginal.default;
const FormControl = FormControlOriginal as unknown as typeof FormControlOriginal.default;
const InputGroup = InputGroupOriginal as unknown as typeof InputGroupOriginal.default;
const InputGroupText = InputGroupTextOriginal as unknown as typeof InputGroupTextOriginal.default;

export function SampleQuestionDemo({
  prompt,
  onMathjaxTypeset,
}: {
  prompt: ExamplePromptWithId;
  onMathjaxTypeset: (elements?: Element[]) => Promise<void>;
}) {
  const [variant, setVariant] = useState(() => generateSampleQuestionVariant(prompt.id));

  // Used if the question receives a number or string response
  const [userInputResponse, setUserInputResponse] = useState('');

  // Used if the question has a checkbox or multiple choice response
  const [selectedOptions, setSelectedOptions] = useState<Set<string>>(() => new Set<string>());

  const [grade, setGrade] = useState<number | null>(null);

  const cardRef = useRef<HTMLElement | null>(null);

  const handleSelectOption = (option: string) => {
    if (prompt.answerType === 'radio') {
      // The user can only select one option.
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

  const handleGenerateNewVariant = async () => {
    // Clear the grade shown to the user
    setGrade(null);

    // Clear the user input response
    setUserInputResponse('');

    // Clear the user's selected options
    setSelectedOptions(new Set<string>());

    // Generate a new question variant
    const questionVariant = generateSampleQuestionVariant(prompt.id);
    setVariant(questionVariant);
  };

  // When a new variant is loaded, typeset the MathJax content.
  useLayoutEffect(() => {
    if (cardRef.current) {
      // eslint-disable-next-line react-you-might-not-need-an-effect/no-pass-live-state-to-parent
      onMathjaxTypeset([cardRef.current]);
    }
  }, [variant?.question, onMathjaxTypeset]);

  const handleGrade = () => {
    if (!variant) {
      return;
    }

    if (variant.answerType === 'number' && prompt.answerType === 'number') {
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

      const isValid =
        responseNum === variant.correctAnswer ||
        (rtol && relativeErrorValid) ||
        (atol && absoluteErrorValid);

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

      const numCorrectSelectedAnswers = variant.correctAnswer.reduce((acc, option) => {
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
      }, 0);

      setGrade(
        100 * ((numCorrectSelectedAnswers + numCorrectUnselectedAnswers) / variant.options.length),
      );
    }
  };

  // The correct answer to the problem, displayed to the user
  const answerText = variant
    ? run(() => {
        if (variant.answerType === 'checkbox' || variant.answerType === 'radio') {
          return variant.correctAnswer.map((option) => variantOptionToString(option)).join(', ');
        }
        if (variant.answerType === 'number') {
          // Round the answer to 4 decimal places
          return Math.round(variant.correctAnswer * 1e4) / 1e4;
        }
        return variant.correctAnswer;
      })
    : '';

  const placeholder = variant
    ? run(() => {
        const placeholderText: string = prompt.answerType;
        if (prompt.answerType === 'number') {
          // Add relative and absolute tolerance if available
          if (prompt.rtol && prompt.atol) {
            return `${placeholderText} (rtol=${prompt.rtol}, atol=${prompt.atol})`;
          } else if (prompt.rtol) {
            return `${placeholderText} (rtol=${prompt.rtol})`;
          } else if (prompt.atol) {
            return `${placeholderText} (atol=${prompt.atol})`;
          }
        }
        return placeholderText;
      })
    : '';

  return (
    <Card class="shadow" ref={cardRef}>
      <CardHeader>
        <div class="d-flex align-items-center gap-2">
          <p class="mb-0">{prompt.name}</p>
          <span class="badge rounded-pill bg-success me-3">Try me!</span>
        </div>
      </CardHeader>
      <CardBody>
        {variant &&
          variant.question
            .split(/(\$\$[\s\S]+?\$\$|\$[\s\S]+?\$|\*\*[\s\S]+?\*\*)/g)
            .filter(Boolean)
            .map((part) => {
              // Bold text
              if (part.startsWith('**') && part.endsWith('**')) {
                return <strong key={`bold-${part.slice(2, -2)}`}>{part.slice(2, -2)}</strong>;
              }

              // MathJax
              if (
                (part.startsWith('$$') && part.endsWith('$$')) ||
                (part.startsWith('$') && part.endsWith('$'))
              ) {
                return <span key={`math-${part.slice(2, -2)}`}>{part}</span>;
              }

              // Regular text
              return <span key={`text-${part.substring(0, 10)}`}>{part}</span>;
            })}
        {(prompt.answerType === 'number' || prompt.answerType === 'string') && (
          <NumericOrStringInput
            userInputResponse={userInputResponse}
            placeholder={placeholder}
            grade={grade}
            answerLabel={prompt.answerLabel}
            answerUnits={prompt.answerUnits}
            onChange={setUserInputResponse}
          />
        )}
        {variant && (variant.answerType === 'checkbox' || variant.answerType === 'radio') && (
          <CheckboxOrRadioInput
            selectedOptions={selectedOptions}
            options={variant.options}
            grade={grade}
            answerType={variant.answerType}
            onSelectOption={handleSelectOption}
          />
        )}
      </CardBody>
      <CardFooter>
        <div class="d-flex flex-wrap justify-content-end align-items-center gap-2">
          <i>Answer: {answerText}</i>
          <div class="flex-grow-1"></div>
          <div class="d-flex align-items-center gap-2">
            <Button onClick={handleGenerateNewVariant}>
              <span class="text-nowrap">New variant</span>
            </Button>

            <Button onClick={handleGrade}>Grade</Button>
          </div>
        </div>
      </CardFooter>
    </Card>
  );
}

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
    <span class={`badge ${badgeType}`}>
      {Math.floor(grade)}
      {'%'}
    </span>
  );
}

function NumericOrStringInput({
  userInputResponse,
  placeholder,
  grade,
  answerLabel,
  answerUnits,
  onChange,
}: {
  userInputResponse: string;
  placeholder: string;
  grade: number | null;
  answerLabel: string;
  answerUnits?: string;
  onChange: (text: string) => void;
}) {
  return (
    <InputGroup class="mt-2">
      <InputGroupText key={answerLabel} as="label" for="sample-question-response" id="answer-label">
        {answerLabel}
      </InputGroupText>
      <FormControl
        id="sample-question-response"
        value={userInputResponse}
        type="text"
        placeholder={placeholder}
        onChange={(e) => onChange(e.currentTarget.value)}
      />
      {(answerUnits || grade !== null) && (
        <InputGroupText>
          {answerUnits && <span class={grade !== null ? 'me-2' : ''}>{answerUnits}</span>}
          {grade !== null && <FeedbackBadge grade={grade} />}
        </InputGroupText>
      )}
    </InputGroup>
  );
}

function CheckboxOrRadioInput({
  selectedOptions,
  options,
  grade,
  answerType,
  onSelectOption,
}: {
  selectedOptions: Set<string>;
  options: VariantOption[];
  grade: number | null;
  answerType: 'checkbox' | 'radio';
  onSelectOption: (option: string) => void;
}) {
  return (
    <div class="mt-2">
      {options.map((option) => (
        <FormCheck
          id={`check-${option.value}`}
          key={option.value}
          type={answerType as 'checkbox' | 'radio'}
          label={variantOptionToString(option)}
          value={option.value}
          checked={selectedOptions.has(option.value)}
          onChange={() => onSelectOption(option.value)}
        />
      ))}
      {grade !== null && (
        <div class="mt-2">
          <FeedbackBadge grade={grade} />
        </div>
      )}
    </div>
  );
}
