import { useState } from 'react';
import Accordion from 'react-bootstrap/Accordion';
import AccordionBody from 'react-bootstrap/AccordionBody';
import AccordionHeader from 'react-bootstrap/AccordionHeader';
import AccordionItem from 'react-bootstrap/AccordionItem';
import Button from 'react-bootstrap/Button';
import FormSelect from 'react-bootstrap/FormSelect';
import InputGroup from 'react-bootstrap/InputGroup';
import OverlayTrigger from 'react-bootstrap/OverlayTrigger';
import Tooltip from 'react-bootstrap/Tooltip';

import { SampleQuestionDemo } from './SampleQuestionDemo.js';
import { examplePromptsArray } from './aiGeneratedQuestionSamples.js';

export function SampleQuestions() {
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
    <Accordion>
      <AccordionItem eventKey="0">
        <AccordionHeader>Example questions and prompts</AccordionHeader>
        <AccordionBody>
          <SampleQuestionDemo
            key={selectedQuestion.id}
            prompt={selectedQuestion}
            header={
              <SampleQuestionSelector
                selectedQuestionIndex={selectedQuestionIndex}
                onSelectQuestionIndex={setSelectedQuestionIndex}
                onClickPrevious={handleClickPrevious}
                onClickNext={handleClickNext}
              />
            }
          />
          <SampleQuestionPrompt prompt={selectedQuestion.prompt} />
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
    <InputGroup>
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
      <Button
        variant="outline-secondary"
        disabled={selectedQuestionIndex === 0}
        aria-label="Previous example"
        onClick={onClickPrevious}
      >
        <i className="bi bi-chevron-left" aria-hidden="true" />
      </Button>
      <Button
        variant="outline-secondary"
        disabled={selectedQuestionIndex === examplePromptsArray.length - 1}
        aria-label="Next example"
        onClick={onClickNext}
      >
        <i className="bi bi-chevron-right" aria-hidden="true" />
      </Button>
    </InputGroup>
  );
}

function SampleQuestionPrompt({ prompt }: { prompt: string }) {
  const handleUsePrompt = () => {
    const promptTextarea = document.querySelector<HTMLTextAreaElement>('#user-prompt-llm');
    if (promptTextarea) {
      promptTextarea.value = prompt;
    }
  };

  return (
    <>
      <p className="fw-bold mb-1 mt-3">Prompt</p>
      <p>{prompt}</p>
      <OverlayTrigger
        placement="top"
        overlay={<Tooltip>Copy this prompt to the prompt input</Tooltip>}
      >
        <Button variant="outline-primary" onClick={handleUsePrompt}>
          Use prompt
        </Button>
      </OverlayTrigger>
    </>
  );
}
