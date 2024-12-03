import { html } from '@prairielearn/html';

import { HeadContents } from '../../../components/HeadContents.html.js';
import { Navbar } from '../../../components/Navbar.html.js';
import { QuestionContainer } from '../../../components/QuestionContainer.html.js';
import { compiledScriptTag, nodeModulesAssetPath } from '../../../lib/assets.js';
import { type AiGenerationPrompt } from '../../../lib/db-types.js';

const examplePrompts = [
  {
    id: 'Select median of 5 random numbers',
    promptGeneral:
      'Write a multiple choice question asking the user to choose the median of 5 random numbers between 1 and 100. Display all numbers to the user, and ask them to choose the median.',
    promptUserInput:
      'Each random number generated should be a potential answer to the multiple-choice question. Randomize the order of the numbers.',
    promptGrading: 'The correct answer is the median of the numbers.',
  },
  {
    id: 'Sum random integers',
    promptGeneral:
      'Write a question that asks the user to multiply two integers. You should randomly generate two integers A and B, display them to the user, and then ask the user to provide the product C = A * B.',
    promptUserInput: 'Provide an integer input box for the user to enter the product.',
    promptGrading: 'The correct answer is the product of A and B.',
  },
  {
    id: 'Answer to Ultimate Question',
    promptGeneral:
      'Write a question asking "What Is The Answer to the Ultimate Question of Life, the Universe, and Everything?".',
    promptUserInput: 'Provide an integer box for the user to answer.',
    promptGrading: 'The correct answer is 42.',
  },
  {
    id: 'Calculate Projectile Distance',
    promptGeneral:
      'Write a question that asks the user to calculate how far a projectile will be launched. Display to the user an angle randomly generated between 30 and 60 degrees, and a velocity randomly generated between 10 and 20 m/s, and ask for the distance (in meters) that the object travels assuming no wind resistance.',
    promptUserInput: 'Provide a numerical input box for the user to enter an answer.',
    promptGrading:
      'The correct answer is the distance that the projectile will travel, using the corresponding formula.',
  },
];

export function AiGeneratePage({
  resLocals,
  prompts,
  qid,
  queryUrl,
}: {
  resLocals: Record<string, any>;
  prompts?: AiGenerationPrompt[];
  qid?: string;
  queryUrl?: string;
}) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${HeadContents({ resLocals })}
        ${compiledScriptTag('question.ts')}
        <script defer src="${nodeModulesAssetPath('mathjax/es5/startup.js')}"></script> 
      </head> 
      <body hx-ext="loading-states">
        ${Navbar({ navPage: 'course_admin', resLocals })}
        <main id="content" class="container-fluid">
        <div>
          <a href="${resLocals.urlPrefix}/ai_generate_question_drafts" class="btn btn-primary mb-4">
            <i class="fa fa-arrow-left" aria-hidden="true"></i>
            Back to draft questions
          </a>
        </div>
          <div class="card  mb-4">
            <div class="card-header bg-primary text-white d-flex justify-content-between">Generate Question using AI
            ${qid ? html`<div class="d-flex flex-row-reverse"><button type="button" class="btn btn-sm btn-light" data-toggle="modal" data-target="#finalizeModal">Finalize question</button></div>` : ''}</div>
            <div class="card-body">
              ${
                !prompts || prompts.length <= 0
                  ? html`<div id="generation-prompter">
                      <p>
                        Please describe your question in as much detail as possible in the box
                        below.
                      </p>
                      <form
                        name="add-question-form"
                        hx-post=${queryUrl !== undefined
                          ? html`"${resLocals.urlPrefix}/ai_generate_question?${queryUrl}"`
                          : html`"${resLocals.urlPrefix}/ai_generate_question"`}
                        hx-target="#generation-results"
                        hx-swap="outerHTML"
                        hx-disabled-elt="button"
                      >
                        <input
                          type="hidden"
                          name="__csrf_token"
                          value="${resLocals.__csrf_token}"
                        />
                        <input type="hidden" name="__action" value="generate_question" />
                        <div class="form-group">
                          <label for="user-prompt-llm">
                            Please give a high-level overview of the question. What internal
                            parameters need to be generated and what information do we provide to
                            students?
                          </label>
                          <textarea
                            name="prompt"
                            id="user-prompt-llm"
                            class="form-control"
                          ></textarea>
                          <div class="form-text form-muted">
                            <em>
                              Example: A toy car is pushed off a table with height h at speed v0.
                              Assume acceleration due to gravity as 9.81 m/s^2. H is a number with 1
                              decimal digit selected at random between 1 and 2 meters. V0 is a an
                              integer between 1 and 4 m/s. How long does it take for the car to
                              reach the ground?
                            </em>
                          </div>
                          <label for="user-prompt-llm-user-input">
                            How should students input their solution? What choices or input boxes
                            are they given?
                          </label>
                          <textarea
                            name="prompt_user_input"
                            id="user-prompt-llm-user-input"
                            class="form-control"
                          ></textarea>
                          <div class="form-text form-muted">
                            <em>
                              Example: students should enter the solution using a decimal number.
                              The answer should be in seconds.
                            </em>
                          </div>
                          <label for="user-prompt-llm-grading">
                            How do we determine if a solution is correct/which answer choice is
                            correct?
                          </label>
                          <textarea
                            name="prompt_grading"
                            id="user-prompt-llm-grading"
                            class="form-control"
                          ></textarea>
                          <div class="form-text form-muted">
                            <em>
                              Example: the answer is computed as sqrt(2 * h / g) where g = 9.81
                              m/s^2
                            </em>
                          </div>
                        </div>
                        <button class="btn btn-primary">
                          <span
                            class="spinner-grow spinner-grow-sm d-none"
                            role="status"
                            aria-hidden="true"
                            data-loading-class-remove="d-none"
                          >
                          </span>
                          Create question
                        </button>
                      </form>
                      Or choose a question from our list of example prompts:
                      <select
                        id="user-prompt-example"
                        onchange="setPromptToExample()"
                        class="custom-select"
                      >
                        <option value=""></option>
                        ${examplePrompts.map(
                          (question) =>
                            html`<option
                              value="${question.id}"
                              data-prompt-general="${question.promptGeneral}"
                              data-prompt-user-input="${question.promptUserInput}"
                              data-prompt-grading="${question.promptGrading}"
                            >
                              ${question.id}
                            </option>`,
                        )}
                      </select>
                      <div id="generation-results"></div>
                    </div>`
                  : html`<div class="container">
                        <div class="row justify-content-center">
                          <div class="col">
                            ${prompts
                              .filter((x) => {
                                return x.prompt_type !== 'auto_revision';
                              })
                              .map((x) => {
                                return html`<div class="d-flex flex-row-reverse">
                                    <div class="p-3 mb-2 bg-secondary text-white rounded">
                                      ${x.user_prompt}
                                    </div>
                                  </div>
                                  <div class="d-flex flex-row">
                                    <div class="p-3 mb-2 bg-dark text-white rounded">
                                      ${x.prompt_type === 'initial'
                                        ? 'We generated a potential question.'
                                        : 'We have made changes. Please check the preview and prompt for further revisions.'}
                                    </div>
                                  </div>`;
                              })}

                            <div>
                              <form
                                name="regen-question-form"
                                hx-post="${resLocals.urlPrefix}/ai_generate_question?${queryUrl}"
                                hx-swap="outerHTML"
                                hx-disabled-elt="button"
                              >
                                <input
                                  type="hidden"
                                  name="__csrf_token"
                                  value="${resLocals.__csrf_token}"
                                />
                                <input type="hidden" name="__action" value="regenerate_question" />
                                <input type="hidden" name="unsafe_qid" value="${qid}" />
                                <div class="form-group">
                                  <label for="user-prompt-llm">What needs to be changed?</label>
                                  <textarea
                                    name="prompt"
                                    id="user-prompt-llm"
                                    class="form-control"
                                  ></textarea>
                                </div>
                                <button class="btn btn-primary">
                                  <span
                                    class="spinner-grow spinner-grow-sm d-none"
                                    role="status"
                                    aria-hidden="true"
                                    data-loading-class-remove="d-none"
                                  ></span>
                                  Adjust question
                                </button>
                              </form>
                            </div>
                          </div>
                          <div class="col">
                            <ul class="nav nav-pills">
                              <li class="nav-item">
                                <a
                                  class="nav-link active"
                                  data-toggle="tab"
                                  aria-current="page"
                                  href="#question-preview"
                                  >Question Preview</a
                                >
                              </li>
                              <li class="nav-item">
                                <a a class="nav-link" data-toggle="tab" href="#question-code"
                                  >Question Source</a
                                >
                              </li>
                            </ul>
                            <div class="tab-content">
                              <div role="tabpanel" id="question-preview" class="tab-pane active">
                                ${QuestionContainer({ resLocals, questionContext: 'instructor' })}
                              </div>
                              <div role="tabpanel" id="question-code" class="tab-pane">
                                <a
                                  href="${resLocals.urlPrefix +
                                  '/jobSequence/' +
                                  prompts[prompts.length - 1].job_sequence_id}"
                                  target="_blank"
                                >
                                  [DEBUG] See Job Logs
                                </a>
                                <div class="mr-auto">
                                  <span class="card-title"> Generated HTML </span>
                                </div>
                                <div id="card-html">
                                  <textarea
                                    id="output-html"
                                    class="bg-dark text-white rounded p-3"
                                    style="width:100%; height:10em"
                                  >
${prompts[prompts.length - 1].html}</textarea
                                  >
                                </div>
                                ${prompts[prompts.length - 1].python === undefined
                                  ? ''
                                  : html`
                                      <div class="mr-auto">
                                        <span class="card-title"> Generated Python </span>
                                      </div>
                                      <div id="card-python">
                                        <textarea
                                          id="output-python"
                                          class="bg-dark text-white rounded p-3"
                                          style="width:100%; height:10em"
                                        >
${prompts[prompts.length - 1].python}</textarea
                                        >
                                      </div>
                                    `}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div
                        class="modal fade"
                        id="finalizeModal"
                        tabindex="-1"
                        role="dialog"
                        aria-hidden="true"
                      >
                        <div class="modal-dialog" role="document">
                          <div class="modal-content">
                            <div class="modal-header">
                              <h5 class="modal-title">Finalize question</h5>
                              <button
                                type="button"
                                class="close"
                                data-dismiss="modal"
                                aria-label="Close"
                              >
                                <span aria-hidden="true">&times;</span>
                              </button>
                            </div>
                            <form class="" name="question-save-form" method="POST">
                              <input type="hidden" name="__action" value="save_question" />
                              <input
                                type="hidden"
                                name="__csrf_token"
                                value="${resLocals.__csrf_token}"
                              />
                              <input type="hidden" name="unsafe_qid" value="${qid}" />
                              <div class="modal-body">
                                <div class="input-group mb-3">
                                  <input
                                    type="text"
                                    class="form-control"
                                    placeholder="Question Title"
                                    aria-label="Question title"
                                    name="title"
                                  />
                                </div>
                                <div class="input-group mb-3">
                                  <input
                                    type="text"
                                    class="form-control"
                                    placeholder="Question ID (ex: addNumbers)"
                                    aria-label="Question ID (ex: addNumbers)"
                                    name="qid"
                                  />
                                </div>
                              </div>
                              <div class="modal-footer">
                                <button
                                  type="button"
                                  class="btn btn-secondary"
                                  data-dismiss="modal"
                                >
                                  Close
                                </button>
                                <button class="btn btn-primary">Finalize question</button>
                              </div>
                            </form>
                          </div>
                        </div>
                      </div>`
              }
              ${
                qid
                  ? html`<p>
                      To use a question in assessments, please
                      <u
                        ><a data-toggle="modal" data-target="#finalizeModal"
                          >finalize the question</a
                        ></u
                      >
                    </p>`
                  : ''
              }
              </div>
            </div>
          </div>
        </main>
      </body>
      <script>
        function setPromptToExample() {
          const options = document.getElementById('user-prompt-example').options;
          const selection = options[options.selectedIndex].dataset;

          document.getElementById('user-prompt-llm').value = selection.promptGeneral;
          document.getElementById('user-prompt-llm-user-input').value = selection.promptUserInput;
          document.getElementById('user-prompt-llm-grading').value = selection.promptGrading;
        }
      </script>
    </html>
  `.toString();
}

export function GenerationFailure({
  urlPrefix,
  jobSequenceId,
}: {
  urlPrefix: string;
  jobSequenceId: string;
}): string {
  return html`
    <div id="generation-results">
      <h3>Generation Failed</h3>

      <p>The LLM did not generate any question file.</p>
      <a href="${urlPrefix + '/jobSequence/' + jobSequenceId}">See job logs</a>
    </div>
  `.toString();
}
