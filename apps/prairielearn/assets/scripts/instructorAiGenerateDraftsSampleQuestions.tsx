import AccordionOriginal from 'react-bootstrap/Accordion';
import AccordionBodyOriginal from 'react-bootstrap/AccordionBody';
import AccordionHeaderOriginal from 'react-bootstrap/AccordionHeader';
import AccordionItemOriginal from 'react-bootstrap/AccordionItem';
import ButtonOriginal from 'react-bootstrap/Button';
import DropdownOriginal from 'react-bootstrap/Dropdown';
import DropdownItemOriginal from 'react-bootstrap/DropdownItem';
import DropdownMenuOriginal from 'react-bootstrap/DropdownMenu';
import DropdownToggleOriginal from 'react-bootstrap/DropdownToggle';

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

import { onDocumentReady } from '@prairielearn/browser-utils';
import { render } from '@prairielearn/preact-cjs';
import { useMemo, useState } from '@prairielearn/preact-cjs/hooks';

import { SampleQuestionDemo } from '../../src/ee/pages/instructorAiGenerateDrafts/SampleQuestionDemo.js';
import { examplePrompts } from '../../src/lib/aiGeneratedQuestionSamples.js';

import { mathjaxTypeset } from './lib/mathjax.js';

onDocumentReady(() => {
  const sampleQuestions = document.querySelector('#sample-questions') as HTMLElement;
  const startOpen = sampleQuestions.dataset.startOpen === 'true';

  render(<SampleQuestion startOpen={startOpen} />, sampleQuestions);
});

function SampleQuestion({ startOpen }: { startOpen: boolean }) {
  const [selectedQuestionIndex, setSelectedQuestionIndex] = useState(0);

  const selectedQuestion = examplePrompts[selectedQuestionIndex];

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

  return (
    <Accordion className="mb-3" defaultActiveKey={startOpen ? '0' : undefined}>
      <AccordionItem eventKey={'0'}>
        <AccordionHeader>Example questions and prompts</AccordionHeader>
        <AccordionBody>
          <SampleQuestionSelector
            selectedQuestionName={selectedQuestion.name}
            selectedQuestionIndex={selectedQuestionIndex}
            onSelectQuestionIndex={setSelectedQuestionIndex}
            onClickPrevious={handleClickPrevious}
            onClickNext={handleClickNext}
          />
          <SampleQuestionDemo prompt={selectedQuestion} onMathjaxTypeset={mathjaxTypeset} />
          <FeatureList
            features={selectedQuestion.features.map((feature, index) => ({
              id: index,
              text: feature,
            }))}
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
    <div style={{ width: '100%' }} className="d-flex align-items-center gap-2 mb-3 flex-wrap">
      <Dropdown
        style={{ flex: 1 }}
        onSelect={(eventKey) => onSelectQuestionIndex(Number(eventKey))}
      >
        <DropdownToggle
          as="button"
          type="button"
          style={{ width: '100%' }}
          className="btn dropdown-toggle border border-gray d-flex justify-content-between align-items-center bg-white"
        >
          {selectedQuestionName}
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
      <div className="d-flex align-items-center gap-2">
        <Button onClick={onClickPrevious} disabled={selectedQuestionIndex === 0}>
          Previous
        </Button>
        <Button
          onClick={onClickNext}
          disabled={selectedQuestionIndex === examplePrompts.length - 1}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

function FeatureList({ features }: { features: { id: number; text: string }[] }) {
  return (
    <>
      <p className="fw-bold mb-1 mt-3">Question features</p>
      <ul>
        {features.map((feature) => (
          <li key={`feature-list-${feature.id}`}>{feature.text}</li>
        ))}
      </ul>
    </>
  );
}

function SampleQuestionPrompt({ prompt }: { prompt: string }) {
  const handleFillPrompt = () => {
    const promptTextarea = document.querySelector('#user-prompt-llm') as HTMLTextAreaElement;
    promptTextarea.value = prompt;
  };

  return (
    <>
      <p className="fw-bold mb-1 mt-3">Prompt</p>
      <p>{prompt}</p>

      <Button onClick={handleFillPrompt}>
        <i className="fa fa-clone mr-2" aria-hidden="true"></i>
        Fill prompt
      </Button>
    </>
  );
}
