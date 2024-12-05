import { html } from '@prairielearn/html';
import { run } from '@prairielearn/run';

import { HeadContents } from '../../../components/HeadContents.html.js';
import { Modal } from '../../../components/Modal.html.js';
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
        ${HeadContents({ resLocals })} ${compiledScriptTag('question.ts')}
        <script defer src="${nodeModulesAssetPath('mathjax/es5/startup.js')}"></script>
      </head>
      <body hx-ext="loading-states">
        ${Navbar({ navPage: 'course_admin', resLocals })}
        <main id="content" class="container mb-4">
          <div class="mb-3">
            <a
              href="${resLocals.urlPrefix}/ai_generate_question_drafts"
              class="btn btn-sm btn-primary"
            >
              <i class="fa fa-arrow-left" aria-hidden="true"></i>
              Back to draft questions
            </a>
          </div>
          <div class="card">
            <div
              class="card-header bg-primary text-white d-flex align-items-center justify-content-between"
            >
              Generate question with AI
              ${prompts && prompts.length > 0
                ? html`
                    <div>
                      <button
                        type="button"
                        class="btn btn-sm btn-light"
                        data-toggle="modal"
                        data-target="#finalizeModal"
                      >
                        <i class="fa fa-check" aria-hidden="true"></i>
                        Finalize question
                      </button>
                    </div>
                  `
                : ''}
            </div>
            <div class="card-body">
              ${!prompts || prompts.length <= 0
                ? html`
                    <div id="generation-prompter">
                      <p>
                        Describe your question in as much detail as possible in the text boxes
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
                            Give a high-level overview of the question. What internal parameters
                            need to be generated and what information do we provide to students?
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
                            How is the correct answer determined?
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

                        <hr />

                        <div class="mb-3">
                          <label for="user-prompt-example" class="form-label">
                            Or choose an example prompt:
                          </label>
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
                      <div id="generation-results"></div>
                    </div>
                  `
                : html`
                    <div class="container">
                      <div class="row">
                        <div class="col-12 col-md-6">
                          <div>
                            ${PromptHistory({ prompts, urlPrefix: resLocals.urlPrefix })}
                            <form
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
                        <div class="col-12 col-md-6">
                          <ul class="nav nav-pills mb-2">
                            <li class="nav-item">
                              <a
                                class="nav-link active"
                                data-toggle="tab"
                                aria-current="page"
                                href="#question-preview"
                                >Question preview</a
                              >
                            </li>
                            <li class="nav-item">
                              <a a class="nav-link" data-toggle="tab" href="#question-code"
                                >Question source</a
                              >
                            </li>
                          </ul>
                          <div class="tab-content">
                            <div role="tabpanel" id="question-preview" class="tab-pane active">
                              ${QuestionContainer({ resLocals, questionContext: 'instructor' })}
                            </div>
                            <div role="tabpanel" id="question-code" class="tab-pane">
                              ${QuestionCodePanel({
                                htmlContents: prompts[prompts.length - 1].html,
                                pythonContents: prompts[prompts.length - 1].python,
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    ${qid ? FinalizeModal({ qid, csrfToken: resLocals.__csrf_token }) : ''}
                  `}
            </div>
            ${qid
              ? html`
                  <div class="card-footer">
                    <a href="#" role="button" data-toggle="modal" data-target="#finalizeModal"
                      >Finalize this question</a
                    >
                    to use it on assessments and make manual edits.
                  </div>
                `
              : ''}
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

function PromptHistory({
  prompts,
  urlPrefix,
}: {
  prompts: AiGenerationPrompt[];
  urlPrefix: string;
}) {
  return prompts
    .filter((prompt) => prompt.prompt_type !== 'auto_revision')
    .map((prompt) => {
      return html`<div class="d-flex flex-row-reverse">
          <div class="p-3 mb-2 bg-secondary text-white rounded">${prompt.user_prompt}</div>
        </div>
        <div class="d-flex flex-row">
          <div class="p-3 mb-2 bg-dark text-white rounded">
            ${prompt.prompt_type === 'initial'
              ? 'We generated a potential question.'
              : 'We have made changes. Please check the preview and prompt for further revisions.'}
            <div>
              ${run(() => {
                if (!prompt.job_sequence_id) return '';

                const jobLogsUrl = urlPrefix + '/jobSequence/' + prompt.job_sequence_id;

                return html`
                  <a class="link-light small" href="${jobLogsUrl}" target="_blank">View job logs</a>
                `;
              })}
            </div>
          </div>
        </div>`;
    });
}

function QuestionCodePanel({
  htmlContents,
  pythonContents,
}: {
  htmlContents: string | null;
  pythonContents: string | null;
}) {
  return html`
    <div class="mr-auto">
      <span class="card-title"> Generated HTML </span>
    </div>
    <div id="card-html">
      <textarea
        id="output-html"
        class="bg-dark text-white rounded p-3"
        style="width:100%; height:10em"
      >
${htmlContents}</textarea
      >
    </div>
    ${pythonContents == null
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
${pythonContents}</textarea
            >
          </div>
        `}
  `;
}

function FinalizeModal({ qid, csrfToken }: { qid: string; csrfToken: string }) {
  return Modal({
    id: 'finalizeModal',
    title: 'Finalize question',
    body: html`
      <div class="alert alert-primary" role="alert">
        After finalizing the question, you will be able to use it on assessments and make manual
        edits.
      </div>
      <div class="mb-3">
        <label for="title" class="form-label">Title</label>
        <input type="text" class="form-control" id="question-title" name="title" required />
        <div class="form-text text-muted">
          The title of the question as it will appear in the question bank, e.g. "Add two random
          numbers".
        </div>
      </div>
      <div class="mb-3">
        <label for="qid" class="form-label">QID</label>
        <input
          type="text"
          class="form-control"
          id="question-qid"
          name="qid"
          pattern="[\\-A-Za-z0-9_\\/]+"
          required
        />
        <div class="form-text text-muted">
          A unique identifier that will be used to include this question in assessments, e.g.
          <code>add-random-numbers</code>.
        </div>
      </div>
    `,
    footer: html`
      <input type="hidden" name="unsafe_qid" value="${qid}" />
      <input type="hidden" name="__action" value="save_question" />
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <button type="button" class="btn btn-secondary" data-dismiss="modal">Close</button>
      <button class="btn btn-primary">Finalize question</button>
    `,
  });
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
