import { html } from '@prairielearn/html';
import { run } from '@prairielearn/run';

import { HeadContents } from '../../../components/HeadContents.html.js';
import { Modal } from '../../../components/Modal.html.js';
import { Navbar } from '../../../components/Navbar.html.js';
import { QuestionContainer } from '../../../components/QuestionContainer.html.js';
import { compiledScriptTag, nodeModulesAssetPath } from '../../../lib/assets.js';
import { type Question, type AiGenerationPrompt } from '../../../lib/db-types.js';

export function InstructorAiGenerateDraftEditor({
  resLocals,
  prompts,
  question,
  variantId,
}: {
  resLocals: Record<string, any>;
  prompts: AiGenerationPrompt[];
  question: Question;
  variantId?: string | undefined;
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
            </div>
            <div class="card-body">
              <div class="container">
                <div class="row">
                  <div class="col-12 col-md-6">
                    <div>
                      ${PromptHistory({
                        prompts,
                        urlPrefix: resLocals.urlPrefix,
                        csrfToken: resLocals.__csrf_token,
                      })}
                      <form
                        hx-post="${variantId
                          ? html`${resLocals.urlPrefix}/ai_generate_editor/${question.id}?variant_id=${variantId}`
                          : html`${resLocals.urlPrefix}/ai_generate_editor/${question.id}`}"
                        hx-swap="outerHTML"
                        hx-disabled-elt="button"
                      >
                        <input
                          type="hidden"
                          name="__csrf_token"
                          value="${resLocals.__csrf_token}"
                        />
                        <input type="hidden" name="__action" value="regenerate_question" />
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
                          csrfToken: resLocals.__csrf_token,
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              ${FinalizeModal({ csrfToken: resLocals.__csrf_token })}
            </div>
            <div class="card-footer">
              <a href="#" role="button" data-toggle="modal" data-target="#finalizeModal"
                >Finalize this question</a
              >
              to use it on assessments and make manual edits.
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

function PromptHistory({
  prompts,
  urlPrefix,
  csrfToken,
}: {
  prompts: AiGenerationPrompt[];
  urlPrefix: string;
  csrfToken: string;
}) {
  return prompts.map((prompt) => {
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
              if (!prompt.job_sequence_id || !prompt.id) return '';

              const jobLogsUrl = urlPrefix + '/jobSequence/' + prompt.job_sequence_id;

              return html`
                <a class="link-light small" href="${jobLogsUrl}" target="_blank">View job logs</a>
                <form method="post">
                  <input type="hidden" name="__action" value="revert_edit_version" />
                  <input type="hidden" name="unsafe_prompt_id" value="${prompt.id}" />
                  <input type="hidden" name="__csrf_token" value="${csrfToken}" />
                  <button class="btn btn-link link-light small d-inline p-0">
                    Revert to this version
                  </button>
                </form>
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
  csrfToken,
}: {
  htmlContents: string | null;
  pythonContents: string | null;
  csrfToken: string;
}) {
  return html`
    <div class="mr-auto">
      <span class="card-title"> Generated HTML </span>
    </div>
    <form method="post">
      <input type="hidden" name="__action" value="submit_manual_revision" />
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <div id="card-html">
        <textarea
          id="output-html"
          class="bg-dark text-white rounded p-3"
          style="width:100%; height:10em"
          name="html"
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
                name="python"
              >
${pythonContents}</textarea
              >
            </div>
          `}
      <button class="btn btn-primary">Save manual edits</button>
    </form>
  `;
}

function FinalizeModal({ csrfToken }: { csrfToken: string }) {
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
      <input type="hidden" name="__action" value="save_question" />
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <button type="button" class="btn btn-secondary" data-dismiss="modal">Close</button>
      <button class="btn btn-primary">Finalize question</button>
    `,
  });
}
