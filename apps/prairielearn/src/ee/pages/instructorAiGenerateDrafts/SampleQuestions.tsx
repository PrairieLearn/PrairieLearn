import { useState } from 'react';
import Accordion from 'react-bootstrap/Accordion';
import AccordionBody from 'react-bootstrap/AccordionBody';
import AccordionHeader from 'react-bootstrap/AccordionHeader';
import AccordionItem from 'react-bootstrap/AccordionItem';
import Button from 'react-bootstrap/Button';
import FormSelect from 'react-bootstrap/FormSelect';

import { MagicConnector } from './MagicConnector.js';
import { SampleQuestionDemo } from './SampleQuestionDemo.js';
import { type SampleQuestionVariant, examplePromptsArray } from './aiGeneratedQuestionSamples.js';

export function SampleQuestions({ initialVariant }: { initialVariant: SampleQuestionVariant }) {
  const [selectedQuestionIndex, setSelectedQuestionIndex] = useState(0);

  const selectedQuestion = examplePromptsArray[selectedQuestionIndex];

  const handleClickPrevious = () => {
    setSelectedQuestionIndex((prevIndex) => Math.max(prevIndex - 1, 0));
  };

  const handleClickNext = () => {
    setSelectedQuestionIndex((prevIndex) =>
      Math.min(prevIndex + 1, examplePromptsArray.length - 1),
    );
  };

  return (
    <Accordion
      style={{
        // Match the border color of the card that's displayed above this accordion.
        // @ts-expect-error -- TypeScript doesn't recognize CSS variables on the style prop.
        '--bs-accordion-border-color': 'var(--bs-border-color-translucent)',
      }}
    >
      <AccordionItem eventKey="0">
        <AccordionHeader>Example prompts</AccordionHeader>
        <AccordionBody className="p-3">
          <SampleQuestionSelector
            selectedQuestionIndex={selectedQuestionIndex}
            onSelectQuestionIndex={setSelectedQuestionIndex}
            onClickPrevious={handleClickPrevious}
            onClickNext={handleClickNext}
          />
          <SampleQuestionPrompt prompt={selectedQuestion.prompt} />
          <MagicConnector />
          <SampleQuestionDemo
            key={selectedQuestion.id}
            prompt={selectedQuestion}
            initialVariant={selectedQuestionIndex === 0 ? initialVariant : undefined}
            header={
              <div className="d-flex align-items-center gap-2">
                <i className="bi bi-check-circle-fill text-success" />
                <span className="fw-medium">Example output</span>
              </div>
            }
          />
        </AccordionBody>
      </AccordionItem>
    </Accordion>
  );
}

SampleQuestions.displayName = 'SampleQuestions';

function SampleQuestionSelector({
  selectedQuestionIndex,
  onSelectQuestionIndex,
  onClickPrevious,
  onClickNext,
}: {
  selectedQuestionIndex: number;
  onSelectQuestionIndex: (index: number) => void;
  onClickPrevious: () => void;
  onClickNext: () => void;
}) {
  return (
    <div className="d-flex align-items-center gap-1">
      <button
        type="button"
        className="btn btn-light"
        disabled={selectedQuestionIndex === 0}
        aria-label="Previous example"
        onClick={onClickPrevious}
      >
        <i className="bi bi-arrow-left" aria-hidden="true" />
      </button>
      <FormSelect
        value={selectedQuestionIndex}
        aria-label="Select example question"
        onChange={(e) => onSelectQuestionIndex(Number(e.target.value))}
      >
        {examplePromptsArray.map((prompt, index) => (
          <option key={prompt.id} value={index}>
            {prompt.name}
          </option>
        ))}
      </FormSelect>
      <button
        type="button"
        className="btn btn-light"
        disabled={selectedQuestionIndex === examplePromptsArray.length - 1}
        aria-label="Next example"
        onClick={onClickNext}
      >
        <i className="bi bi-arrow-right" aria-hidden="true" />
      </button>
    </div>
  );
}

function SampleQuestionPrompt({ prompt }: { prompt: string }) {
  const handleUsePrompt = () => {
    const promptTextarea = document.querySelector<HTMLTextAreaElement>('#user-prompt-llm');
    if (promptTextarea) {
      promptTextarea.value = prompt;
      promptTextarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
  };

  return (
    <div
      className="rounded border p-3 mt-3"
      style={{
        backgroundColor: 'rgba(var(--bs-primary-rgb), 0.05)',
        borderColor: 'rgba(var(--bs-primary-rgb), 0.2)',
      }}
    >
      <div className="d-flex align-items-center gap-2 mb-2">
        <i className="bi bi-chat-left-text text-primary small" />
        <span className="fw-medium text-primary">Prompt</span>
      </div>
      <p className="mb-2">{prompt}</p>
      <Button variant="link" className="p-0 text-decoration-none" onClick={handleUsePrompt}>
        Use this prompt <i className="bi bi-arrow-right small" />
      </Button>
    </div>
  );
}
