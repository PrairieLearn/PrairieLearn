import { html } from '@prairielearn/html';
import { run } from '@prairielearn/run';

import { HeadContents } from '../../../components/HeadContents.html.js';
import { Modal } from '../../../components/Modal.html.js';
import { Navbar } from '../../../components/Navbar.html.js';
import { QuestionContainer } from '../../../components/QuestionContainer.html.js';
import { compiledScriptTag, nodeModulesAssetPath } from '../../../lib/assets.js';
import { type Question, type AiQuestionGenerationPrompt } from '../../../lib/db-types.js';

export function InstructorAiGenerateDraftEditor({
  resLocals,
  prompts,
  question,
  variantId,
}: {
  resLocals: Record<string, any>;
  prompts: AiQuestionGenerationPrompt[];
  question: Question;
  variantId?: string | undefined;
}) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${HeadContents({ resLocals })} ${compiledScriptTag('question.ts')}
        <script defer src="${nodeModulesAssetPath('mathjax/es5/startup.js')}"></script>
        <style>
          body,
          .app-container {
            width: 100%;
            height: 100%;
            position: absolute;
            overscroll-behavior: none;
          }

          .app-grid {
            display: grid;
            grid-template-rows: min-content 1fr;
            grid-template-areas: 'navbar' 'content';
          }

          .app-navbar {
            grid-area: navbar;
          }

          .app-content {
            grid-area: content;
            overflow-y: auto;
          }

          @media (min-width: 768px) {
            .app-grid {
              height: 100%;
            }
          }
        </style>
      </head>
      <body hx-ext="loading-states">
        <div class="app-container">
          <div class="app-grid">
            <div class="app-navbar">${Navbar({ navPage: 'course_admin', resLocals })}</div>
            <main id="content" class="container mb-4 app-content">
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
                          ${PromptHistory({ prompts, urlPrefix: resLocals.urlPrefix })}
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
          </div>
        </div>
      </body>
    </html>
  `.toString();
}

function PromptHistory({
  prompts,
  urlPrefix,
}: {
  prompts: AiQuestionGenerationPrompt[];
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
