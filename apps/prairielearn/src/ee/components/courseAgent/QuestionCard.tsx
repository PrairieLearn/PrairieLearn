import { useState } from 'react';
import { Button, Form } from 'react-bootstrap';

import type { QuestionPart } from '@prairielearn/course-agent-types';

const OTHER = -1;

const replaceAt = <T,>(items: T[], index: number, value: T) =>
  items.map((item, i) => (i === index ? value : item));

/**
 * Questions the agent asked with `request_user_input_async`. Answering sends an ordinary user
 * message, so any message sent while the questions are open answers them too.
 */
export function QuestionCard({
  part,
  answered,
  canAnswer,
  onAnswer,
}: {
  part: QuestionPart;
  /** Staff have sent a message since the agent asked; it shows below as the answer. */
  answered: boolean;
  canAnswer: boolean;
  onAnswer: (text: string) => void;
}) {
  // The recommended option is listed first and starts selected.
  const [selected, setSelected] = useState<number[]>(() =>
    part.questions.map((question) => (question.options?.length ? 0 : OTHER)),
  );
  const [other, setOther] = useState(() => part.questions.map(() => ''));

  if (answered) {
    return (
      <div className="border rounded p-2 small text-muted">
        {part.questions.map((question, index) => (
          // A part's questions never change, and titles need not be unique.
          // oxlint-disable-next-line react/no-array-index-key
          <div key={index}>{question.title}</div>
        ))}
      </div>
    );
  }

  const answers = part.questions.map((question, index) =>
    selected[index] === OTHER ? other[index].trim() : question.options![selected[index]],
  );
  const complete = answers.every((answer) => answer.length > 0);

  const submit = () => {
    if (!complete || !canAnswer) return;
    // With several questions, each answer needs its question to be unambiguous.
    onAnswer(
      answers.length === 1
        ? answers[0]
        : part.questions
            .map((question, index) => `${question.title}\n${answers[index]}`)
            .join('\n\n'),
    );
  };

  return (
    <Form
      className="border border-primary rounded p-2"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {part.questions.map((question, index) => {
        const name = `question-${part.itemId}-${index}`;
        return (
          // oxlint-disable-next-line react/no-array-index-key
          <fieldset key={index} className={index > 0 ? 'mt-3' : undefined}>
            <legend className="fs-6 fw-semibold mb-2">{question.title}</legend>
            {question.options?.map((option, optionIndex) => (
              <Form.Check
                // oxlint-disable-next-line react/no-array-index-key
                key={optionIndex}
                type="radio"
                id={`${name}-${optionIndex}`}
                name={name}
                label={option}
                checked={selected[index] === optionIndex}
                disabled={!canAnswer}
                onChange={() => setSelected(replaceAt(selected, index, optionIndex))}
              />
            ))}
            <div className="d-flex align-items-center gap-2 mt-1">
              {question.options?.length ? (
                <Form.Check
                  type="radio"
                  id={`${name}-other`}
                  name={name}
                  aria-label="Other"
                  checked={selected[index] === OTHER}
                  disabled={!canAnswer}
                  onChange={() => setSelected(replaceAt(selected, index, OTHER))}
                />
              ) : null}
              <Form.Control
                size="sm"
                placeholder={question.options?.length ? 'Something else…' : 'Your answer…'}
                aria-label={question.options?.length ? 'Other answer' : 'Answer'}
                value={other[index]}
                disabled={!canAnswer}
                // Selecting on focus would strand keyboard users tabbing past the field to Send.
                onChange={(event) => {
                  setSelected(replaceAt(selected, index, OTHER));
                  setOther(replaceAt(other, index, event.target.value));
                }}
              />
            </div>
          </fieldset>
        );
      })}
      <div className="d-flex justify-content-end mt-2">
        <Button type="submit" size="sm" disabled={!complete || !canAnswer}>
          {part.questions.length === 1 ? 'Send answer' : 'Send answers'}
        </Button>
      </div>
    </Form>
  );
}
