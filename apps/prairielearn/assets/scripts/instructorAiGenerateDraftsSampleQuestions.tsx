import AccordionOriginal from 'react-bootstrap/Accordion';
import AccordionBodyOriginal from 'react-bootstrap/AccordionBody';
import AccordionHeaderOriginal from 'react-bootstrap/AccordionHeader';
import AccordionItemOriginal from 'react-bootstrap/AccordionItem';
import ButtonOriginal from 'react-bootstrap/Button';
import DropdownOriginal from 'react-bootstrap/Dropdown';
import DropdownItemOriginal from 'react-bootstrap/DropdownItem';
import DropdownMenuOriginal from 'react-bootstrap/DropdownMenu';
import DropdownToggleOriginal from 'react-bootstrap/DropdownToggle';
import OverlayTriggerOriginal from 'react-bootstrap/OverlayTrigger';
import TooltipOriginal from 'react-bootstrap/Tooltip';

const Accordion = AccordionOriginal as unknown as typeof AccordionOriginal.default;
const AccordionItem = AccordionItemOriginal as unknown as typeof AccordionItemOriginal.default;
const AccordionHeader =
  AccordionHeaderOriginal as unknown as typeof AccordionHeaderOriginal.default;
const AccordionBody = AccordionBodyOriginal as unknown as typeof AccordionBodyOriginal.default;
const Button = ButtonOriginal as unknown as typeof ButtonOriginal.default;
const Dropdown = DropdownOriginal as unknown as typeof DropdownOriginal.default;
const DropdownToggle = DropdownToggleOriginal as unknown as typeof DropdownToggleOriginal.default;
const DropdownMenu = DropdownMenuOriginal as unknown as typeof DropdownMenuOriginal.default;
const DropdownItem = DropdownItemOriginal as unknown as typeof DropdownItemOriginal.default;
const OverlayTrigger = OverlayTriggerOriginal as unknown as typeof OverlayTriggerOriginal.default;
const Tooltip = TooltipOriginal as unknown as typeof TooltipOriginal.default;

import { onDocumentReady } from '@prairielearn/browser-utils';
import { render } from '@prairielearn/preact-cjs';
import { useCallback, useState } from '@prairielearn/preact-cjs/hooks';

import { SampleQuestionDemo } from '../../src/ee/pages/instructorAiGenerateDrafts/SampleQuestionDemo.js';
import { examplePromptsArray } from '../../src/ee/pages/instructorAiGenerateDrafts/aiGeneratedQuestionSamples.js';

import { mathjaxTypeset } from './lib/mathjax.js';

onDocumentReady(() => {
  const sampleQuestions = document.querySelector('#sample-questions') as HTMLElement;
  render(<SampleQuestion />, sampleQuestions);
});

function SampleQuestion() {
  const [selectedQuestionIndex, setSelectedQuestionIndex] = useState(0);
  const onMathjaxTypeset = useCallback(mathjaxTypeset, []);

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
          <SampleQuestionSelector
            selectedQuestionName={selectedQuestion.name}
            selectedQuestionIndex={selectedQuestionIndex}
            onSelectQuestionIndex={setSelectedQuestionIndex}
            onClickPrevious={handleClickPrevious}
            onClickNext={handleClickNext}
          />
          <SampleQuestionDemo
            key={selectedQuestion.id}
            prompt={selectedQuestion}
            onMathjaxTypeset={onMathjaxTypeset}
          />
          <SampleQuestionPrompt prompt={selectedQuestion.prompt} />
        </AccordionBody>
      </AccordionItem>
    </Accordion>
  );
}

function SampleQuestionSelector({
  selectedQuestionName,
  selectedQuestionIndex,
  onSelectQuestionIndex,
  onClickPrevious,
  onClickNext,
}: {
  selectedQuestionName: string;
  selectedQuestionIndex: number;
  onSelectQuestionIndex: (index: number) => void;
  onClickPrevious: () => void;
  onClickNext: () => void;
}) {
  return (
    <div style={{ width: '100%' }} class="d-flex align-items-center gap-2 mb-3 flex-wrap">
      <Dropdown
        style={{ flex: 1 }}
        onSelect={(eventKey) => onSelectQuestionIndex(Number(eventKey))}
      >
        <DropdownToggle
          as="button"
          type="button"
          style={{ width: '100%' }}
          class="btn dropdown-toggle border border-gray d-flex justify-content-between align-items-center bg-white"
        >
          {selectedQuestionName}
        </DropdownToggle>
        <DropdownMenu>
          {examplePromptsArray.map((prompt, index) => (
            <DropdownItem
              key={prompt.id}
              active={index === selectedQuestionIndex}
              eventKey={index.toString()}
            >
              {prompt.name}
            </DropdownItem>
          ))}
        </DropdownMenu>
      </Dropdown>
      <div class="d-flex align-items-center gap-2">
        <Button onClick={onClickPrevious} disabled={selectedQuestionIndex === 0}>
          Previous
        </Button>
        <Button
          onClick={onClickNext}
          disabled={selectedQuestionIndex === examplePromptsArray.length - 1}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

function SampleQuestionPrompt({ prompt }: { prompt: string }) {
  const handleUsePrompt = () => {
    const promptTextarea = document.querySelector('#user-prompt-llm') as HTMLTextAreaElement;
    promptTextarea.value = prompt;
  };

  return (
    <>
      <p class="fw-bold mb-1 mt-3">Prompt</p>
      <p>{prompt}</p>
      <OverlayTrigger
        placement="top"
        overlay={<Tooltip>Copy this prompt to the prompt input</Tooltip>}
      >
        <Button onClick={handleUsePrompt}>Use prompt</Button>
      </OverlayTrigger>
    </>
  );
}
