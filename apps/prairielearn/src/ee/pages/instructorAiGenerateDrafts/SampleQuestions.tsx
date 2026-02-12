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
          <FormSelect
            value={selectedQuestionIndex}
            aria-label="Select example prompt"
            onChange={(e) => setSelectedQuestionIndex(Number(e.target.value))}
          >
            {examplePromptsArray.map((prompt, index) => (
              <option key={prompt.id} value={index}>
                {prompt.name}
              </option>
            ))}
          </FormSelect>
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

function smoothScrollIntoView(element: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    let scrollStarted = false;

    // Use capture phase because scroll/scrollend don't bubble — if the scroll
    // happens on a container element rather than the document, only capture
    // phase listeners on document will see the events.
    const onScroll = () => {
      scrollStarted = true;
      document.removeEventListener('scroll', onScroll, true);
      document.addEventListener('scrollend', () => resolve(), { once: true, capture: true });
      // Fallback in case scrollend isn't supported or never fires.
      setTimeout(resolve, 1000);
    };

    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // If no scroll event fires within 50ms, the element is already in position.
    setTimeout(() => {
      if (!scrollStarted) {
        document.removeEventListener('scroll', onScroll, true);
        resolve();
      }
    }, 50);
  });
}

function SampleQuestionPrompt({ prompt }: { prompt: string }) {
  const handleUsePrompt = async () => {
    const promptTextarea = document.querySelector<HTMLTextAreaElement>('#user-prompt-llm');
    if (!promptTextarea) return;

    // Fill the text before scrolling so the user sees it as it comes into view.
    promptTextarea.value = prompt;
    promptTextarea.dispatchEvent(new Event('input', { bubbles: true }));

    await smoothScrollIntoView(promptTextarea);

    promptTextarea.focus({ preventScroll: true });

    // Subtle grow/shrink pulse to draw attention.
    promptTextarea.style.transition = 'transform 0.2s ease-out';
    promptTextarea.style.transform = 'scale(1.02)';
    setTimeout(() => {
      promptTextarea.style.transform = 'scale(1)';
      setTimeout(() => {
        promptTextarea.style.transition = '';
        promptTextarea.style.transform = '';
      }, 200);
    }, 200);
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
