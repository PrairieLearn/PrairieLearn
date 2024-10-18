import { html } from '@prairielearn/html';

import { HeadContents } from '../../../components/HeadContents.html.js';
import { Navbar } from '../../../components/Navbar.html.js';

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

export function AiGeneratePage({ resLocals }: { resLocals: Record<string, any> }) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${HeadContents({ resLocals })}
      </head>
      <body hx-ext="loading-states">
        ${Navbar({ navPage: 'course_admin', resLocals })}
        <main id="content" class="container-fluid">
          <div class="card  mb-4">
            <div class="card-header bg-primary text-white d-flex">Generate Question using AI</div>
            <div class="card-body">
              <p>Please describe your question in as much detail as possible in the box below.</p>
              <form
                name="add-question-form"
                hx-post="${resLocals.urlPrefix}/ai_generate_question"
                hx-target="#generation-results"
                hx-swap="outerHTML"
                hx-disabled-elt="button"
              >
                <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
                <input type="hidden" name="__action" value="generate_question" />
                <div class="form-group">
                  <label for="user-prompt-llm">
                    Please give a high-level overview of the question. What internal parameters need
                    to be generated and what information do we provide to students?
                  </label>
                  <textarea name="prompt" id="user-prompt-llm" class="form-control"></textarea>
                  <label for="user-prompt-llm-user-input">
                    How should students input their solution? What choices or input boxes are they
                    given?
                  </label>
                  <textarea
                    name="prompt_user_input"
                    id="user-prompt-llm-user-input"
                    class="form-control"
                  ></textarea>
                  <label for="user-prompt-llm-grading">
                    How do we determine if a solution is correct/which answer choice is correct?
                  </label>
                  <textarea name="prompt_grading" id="user-prompt-llm-grading" class="form-control">
                  </textarea>
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
              <br />
              <div>
                <a href="${resLocals.urlPrefix}/ai_generate_question_jobs" class="btn btn-primary">
                  Previous Generation Jobs
                </a>
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

export const GenerationResults = (
  generatedHTML: string | undefined,
  generatedPython: string | undefined,
  seqId: string,
  resLocals,
): string => {
  if (generatedHTML === undefined) {
    return html`
      <div id="generation-results">
        <hr />
        <h1>Generation Failed</h1>
        <p>The generated code did not include a question.html file.</p>
        <a href="${resLocals.urlPrefix + '/jobSequence/' + seqId}" target="_blank">
          See Job Logs
        </a>
      </div>
    `.toString();
  }
  return html`
    <div id="generation-results">
      <hr />
      <p>Generation Results:</p>
      <a href="${resLocals.urlPrefix + '/jobSequence/' + seqId}" target="_blank">
        [DEBUG] See Job Logs
      </a>
      <div class="mr-auto">
        <span class="card-title"> Generated HTML </span>
      </div>
      <div id="card-html">
        <pre id="output-html" class="bg-dark text-white rounded p-3">
${generatedHTML} 
          </pre
        >
      </div>
      ${generatedPython === undefined
        ? ''
        : html`
            <div class="mr-auto">
              <span class="card-title"> Generated Python </span>
            </div>
            <div id="card-python">
              <pre id="output-python" class="bg-dark text-white rounded p-3">
${generatedPython} 
          </pre
              >
            </div>
          `}
      <form
        name="regen-question-form"
        hx-post="${resLocals.urlPrefix}/ai_generate_question"
        hx-target="#generation-results"
        hx-swap="outerHTML"
        hx-disabled-elt="button"
      >
        <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
        <input type="hidden" name="__action" value="regenerate_question" />
        <input type="hidden" name="unsafe_sequence_job_id" value="${seqId}" />
        <div class="form-group">
          <label for="user-prompt-llm">What needs to be changed?</label>
          <textarea name="prompt" id="user-prompt-llm" class="form-control"></textarea>
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
      <br />
      <div>
        <form class="" name="resync-context-form" method="POST">
          <input type="hidden" name="__action" value="save_question" />
          <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
          <input type="hidden" name="unsafe_sequence_job_id" value="${seqId}" />
          <button class="btn btn-primary">Save Question</button>
        </form>
      </div>
    </div>
  `.toString();
};

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
