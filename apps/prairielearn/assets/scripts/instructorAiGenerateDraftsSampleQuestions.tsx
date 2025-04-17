
import { h, render } from 'preact';
import Accordion from 'react-bootstrap/Accordion';

import { onDocumentReady } from '@prairielearn/browser-utils';

onDocumentReady(() => {
    const sampleQuestions = document.querySelector('#sample-questions') as HTMLElement;
    const startOpen = sampleQuestions.dataset.startOpen === 'true';
    
    function SampleQuestion() {

        return <Accordion defaultActiveKey="0">
            <Accordion.Item eventKey="0">
                <Accordion.Header>Accordion Item #1</Accordion.Header>
                <Accordion.Body>
                    Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do
                    eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad
                    minim veniam, quis nostrud exercitation ullamco laboris nisi ut
                    aliquip ex ea commodo consequat. Duis aute irure dolor in
                    reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla
                    pariatur. Excepteur sint occaecat cupidatat non proident, sunt in
                    culpa qui officia deserunt mollit anim id est laborum.
                </Accordion.Body>
            </Accordion.Item>
        </Accordion>

        // return <div class="accordion my-3" id="sample-question-accordion">
        //     <div class="accordion-item">
        //         <h2 class="accordion-header" id="sample-question-accordion-heading">
        //             <button
        //                 class="accordion-button"
        //                 type="button"
        //                 data-bs-toggle="collapse"
        //                 data-bs-target="#sample-question-content"
        //                 aria-expanded={startOpen}
        //                 aria-controls="sample-question-content"
        //             >
        //                 Example questions and prompts
        //             </button>
        //         </h2>
        //         <div
        //             id="sample-question-content"
        //             class="accordion-collapse ${startOpen ? 'show' : 'collapse'}"
        //             aria-labelledby="sample-question-accordion-heading"
        //             data-bs-parent="#sample-question-accordion"
        //         >
        //             <div class="accordion-body">
        //                 <div class="tab-content">
        //                     <div class="d-flex align-items-center gap-2">
        //                         <button
        //                             type="button"
        //                             style="width: 100%;"
        //                             class="btn dropdown-toggle border border-gray d-flex justify-content-between align-items-center bg-white"
        //                             aria-label="Change example question"
        //                             aria-haspopup="true"
        //                             aria-expanded="false"
        //                             data-bs-toggle="dropdown"
        //                             data-bs-boundary="window"
        //                         >
        //                             <span
        //                                 id="sample-question-selector-button-text"
        //                                 class="w-100 me-4 text-start"
        //                                 style="white-space: normal;"
        //                             >
        //                                 {examplePrompts[0].name}
        //                             </span>
        //                         </button>
        //                         <div class="dropdown-menu py-0">
        //                             <div class="overflow-auto">
        //                                 {examplePrompts.map((a, index) => {
        //                                 return <a
        //                                         class="dropdown-item"
        //                                         data-id={a.id}
        //                                     >
        //                                     {a.name}
        //                                     </a>
        //                                 })}
        //                             </div>
        //                         </div>
        //                         <button id="previous-question-button" type="button" class="btn btn-primary">
        //                             Previous
        //                         </button>
        //                         <button id="next-question-button" type="button" class="btn btn-primary">
        //                             Next
        //                         </button>
        //                     </div>
        //                     <p class="fw-bold mb-1 mt-3">Question features</p>
        //                     <ul id="feature-list">
        //                         <li>Test 1</li>
        //                         <li>Test 2</li>
        //                         <li>Test 3</li>
        //                     </ul>

        //                     <p class="fw-bold mb-1 mt-3">Prompt</p>
        //                     <p id="sample-question-prompt">{examplePrompts[0].promptGeneral}</p>
        //                     <button id="fill-prompts" type="button" class="btn btn-primary me-2">
        //                         <i class="fa fa-clone mr-2" aria-hidden="true"></i>
        //                         Fill prompt
        //                     </button>
        //                 </div>
        //             </div>
        //         </div>
        //     </div>  
        // </div>
    }

    render(
        <SampleQuestion />,
        sampleQuestions
    );
})
