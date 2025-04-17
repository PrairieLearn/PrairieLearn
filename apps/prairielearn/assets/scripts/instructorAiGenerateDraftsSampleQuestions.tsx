
import { Fragment, h, render } from 'preact';

import { onDocumentReady } from '@prairielearn/browser-utils';
import { examplePrompts } from '../../src/lib/aiGeneratedQuestionSamples.js';

onDocumentReady(() => {
    const sampleQuestions = document.querySelector('#sample-questions') as HTMLElement;
    const startOpen = sampleQuestions.dataset.startOpen === 'true';
    
    function SampleQuestion() {
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
                    class="accordion-collapse ${startOpen ? 'show' : 'collapse'}"
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
