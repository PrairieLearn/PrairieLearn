import { render } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import Accordion from 'react-bootstrap/Accordion';
import Button from 'react-bootstrap/Button';
import Dropdown from 'react-bootstrap/Dropdown';

import { onDocumentReady } from '@prairielearn/browser-utils';

import { examplePrompts } from '../../src/lib/aiGeneratedQuestionSamples.js';

onDocumentReady(() => {
    const sampleQuestions = document.querySelector('#sample-questions') as HTMLElement;
    const startOpen = sampleQuestions.dataset.startOpen === 'true';
    
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
              <Accordion.Item>
                <Accordion.Header>Example questions and prompts</Accordion.Header>
                <Accordion.Body>
                    <div class="d-flex align-items-center gap-2">
                        <Dropdown
                            variant="light"
                            style={{ width: '100%' }}
                            onSelect={(eventKey) =>
                                setSelectedQuestionIndex(Number(eventKey))
                            }
                        >
                            <Dropdown.Toggle
                                as="button"
                                type="button"
                                style={{'width': '100%'}}
                                className="btn dropdown-toggle border border-gray d-flex justify-content-between align-items-center bg-white"
                            >
                                {selectedQuestion.name}
                            </Dropdown.Toggle>
                            <Dropdown.Menu>
                                <div>
                                    {examplePrompts.map((prompt, index) => (
                                        <Dropdown.Item 
                                            key={prompt.id} 
                                            active={index === selectedQuestionIndex} 
                                            eventKey={index.toString()}
                                        >
                                            {prompt.name}
                                        </Dropdown.Item>
                                    ))}
                                </div>
                            </Dropdown.Menu>
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
                    <p class="fw-bold mb-1 mt-3">Question features</p>
                    <ul id="feature-list">
                        {selectedQuestion.features.map((feature) => (
                            <li key={Math.random()}>{feature}</li>
                        ))}
                    </ul>


                    <p class="fw-bold mb-1 mt-3">Prompt</p>
                    <p id="sample-question-prompt">{selectedQuestion.promptGeneral}</p>
                    <button id="fill-prompts" type="button" class="btn btn-primary me-2">
                        <i class="fa fa-clone mr-2" aria-hidden="true"></i>
                        Fill prompt
                    </button>
                </Accordion.Body>
              </Accordion.Item>
            </Accordion>

        )
        
        return <div class="accordion my-3" id="sample-question-accordion">
            <div class="accordion-item">
                <h2 class="accordion-header" id="sample-question-accordion-heading">
                    <button
                        class="accordion-button"
                        type="button"
                        data-bs-toggle="collapse"
                        data-bs-target="#sample-question-content"
                        aria-expanded={startOpen}
                        aria-controls="sample-question-content"
                    >
                        Example questions and prompts
                    </button>
                </h2>
                <div
                    id="sample-question-content"
                    aria-labelledby="sample-question-accordion-heading"
                    data-bs-parent="#sample-question-accordion"
                >
                    <div class="accordion-body">
                        <div class="tab-content">
                            <div class="d-flex align-items-center gap-2">
                                <button
                                    type="button"
                                    style="width: 100%;"
                                    class="btn dropdown-toggle border border-gray d-flex justify-content-between align-items-center bg-white"
                                    aria-label="Change example question"
                                    aria-haspopup="true"
                                    aria-expanded="false"
                                    data-bs-toggle="dropdown"
                                    data-bs-boundary="window"
                                >
                                    <span
                                        id="sample-question-selector-button-text"
                                        class="w-100 me-4 text-start"
                                        style="white-space: normal;"
                                    >
                                        {examplePrompts[0].name}
                                    </span>
                                </button>
                                <div class="dropdown-menu py-0">
                                    <div class="overflow-auto">
                                        {examplePrompts.map((a, index) => {
                                        return <a
                                                key={index}
                                                class="dropdown-item"
                                                data-id={a.id}
                                            >
                                            {a.name}
                                            </a>
                                        })}
                                    </div>
                                </div>
                                <button id="previous-question-button" type="button" class="btn btn-primary">
                                    Previous
                                </button>
                                <button id="next-question-button" type="button" class="btn btn-primary">
                                    Next
                                </button>
                            </div>
                            <p class="fw-bold mb-1 mt-3">Question features</p>
                            <ul id="feature-list">
                                <li>Test 1</li>
                                <li>Test 2</li>
                                <li>Test 3</li>
                            </ul>

                            <p class="fw-bold mb-1 mt-3">Prompt</p>
                            <p id="sample-question-prompt">{examplePrompts[0].promptGeneral}</p>
                            <button id="fill-prompts" type="button" class="btn btn-primary me-2">
                                <i class="fa fa-clone mr-2" aria-hidden="true"></i>
                                Fill prompt
                            </button>
                        </div>
                    </div>
                </div>
            </div>  
        </div>
    
    }

    render(
        <SampleQuestion />,
        sampleQuestions
    );
})
