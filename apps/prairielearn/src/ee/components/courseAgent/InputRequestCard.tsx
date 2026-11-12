import { useState } from 'react';
import { Button, Form } from 'react-bootstrap';

import type { InputRequestPart } from '@prairielearn/course-agent-types';

const OTHER = -1;

const replaceAt = <T,>(items: T[], index: number, value: T) =>
  items.map((item, i) => (i === index ? value : item));

/**
 * Input the agent requested with `request_user_input_async`. Answering sends an ordinary user
 * message, so any message sent while the request is open answers it too.
 */
export function InputRequestCard({
  part,
  answered,
  canAnswer,
  onAnswer,
}: {
  part: InputRequestPart;
  /** Staff have sent a message since the agent asked; it shows below as the answer. */
  answered: boolean;
  canAnswer: boolean;
  onAnswer: (text: string) => void;
}) {
  // The recommended option is listed first and starts selected.
  const [selected, setSelected] = useState<number[]>(() =>
    part.prompts.map((prompt) => (prompt.options?.length ? 0 : OTHER)),
  );
  const [other, setOther] = useState(() => part.prompts.map(() => ''));

  if (answered) {
    return (
      <div className="border rounded p-2 small text-muted">
        {part.prompts.map((prompt, index) => (
          // A part's prompts never change, and titles need not be unique.
          // oxlint-disable-next-line react/no-array-index-key
          <div key={index}>{prompt.title}</div>
        ))}
      </div>
    );
  }

  const answers = part.prompts.map((prompt, index) =>
    selected[index] === OTHER ? other[index].trim() : prompt.options![selected[index]],
  );
  const complete = answers.every((answer) => answer.length > 0);

  const submit = () => {
    if (!complete || !canAnswer) return;
    // With several prompts, each answer needs its prompt to be unambiguous.
    onAnswer(
      answers.length === 1
        ? answers[0]
        : part.prompts.map((prompt, index) => `${prompt.title}\n${answers[index]}`).join('\n\n'),
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
      {part.prompts.map((prompt, index) => {
        const name = `input-request-${part.itemId}-${index}`;
        return (
          // oxlint-disable-next-line react/no-array-index-key
          <fieldset key={index} className={index > 0 ? 'mt-3' : undefined}>
            <legend className="fs-6 fw-semibold mb-2">{prompt.title}</legend>
            {prompt.options?.map((option, optionIndex) => (
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
              {prompt.options?.length ? (
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
                placeholder={prompt.options?.length ? 'Something else…' : 'Your answer…'}
                aria-label={prompt.options?.length ? 'Other answer' : 'Answer'}
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
          {part.prompts.length === 1 ? 'Send answer' : 'Send answers'}
        </Button>
      </div>
    </Form>
  );
}
