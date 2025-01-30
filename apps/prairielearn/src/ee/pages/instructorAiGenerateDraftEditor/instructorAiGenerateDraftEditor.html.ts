import { html } from '@prairielearn/html';
import { run } from '@prairielearn/run';

import { HeadContents } from '../../../components/HeadContents.html.js';
import { Modal } from '../../../components/Modal.html.js';
import { Navbar } from '../../../components/Navbar.html.js';
import { QuestionContainer } from '../../../components/QuestionContainer.html.js';
import { compiledScriptTag, nodeModulesAssetPath } from '../../../lib/assets.js';
import { b64EncodeUnicode } from '../../../lib/base64-util.js';
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
  // This page has a very custom layout, so we don't use the usual `PageLayout`
  // component here. If we start building other similar pages, we might want to
  // teach `PageLayout` how to render this kind of layout.
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        <meta
          name="ace-base-path"
          content="${nodeModulesAssetPath('ace-builds/src-min-noconflict/')}"
        />
        ${[
          HeadContents({ resLocals }),
          compiledScriptTag('question.ts'),
          compiledScriptTag('instructorAiGenerateDraftEditorClient.ts'),
        ]}
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
            height: 100%;
            display: grid;
            grid-template-areas: 'navbar' 'content';
            grid-template-rows: min-content 1fr;
          }

          .app-navbar {
            grid-area: navbar;
          }

          .app-content {
            grid-area: content;

            display: grid;
            grid-template-areas: 'chat preview';
            grid-template-columns: 400px 1fr;
            min-height: 0;
          }

          .app-chat {
            grid-area: chat;

            display: grid;
            grid-template-areas: 'back' 'history' 'prompt';
            grid-template-rows: min-content 1fr min-content;
            min-height: 0;
          }

          .app-chat-back {
            grid-area: back;
          }

          .app-chat-history {
            grid-area: history;
            overflow-y: auto;
            scrollbar-color: var(--bs-secondary) transparent;
          }

          .app-chat-prompt {
            grid-area: prompt;
          }

          .app-preview {
            grid-area: preview;

            display: grid;
            grid-template-areas: 'tabs' 'content';
            grid-template-rows: min-content 1fr;
            min-height: 0;
          }

          .app-preview-tabs {
            grid-area: tabs;
          }

          .app-preview-content {
            grid-area: content;
            min-height: 0;
            overflow-y: auto;
          }

          .question-wrapper {
            max-width: 900px;
          }

          .editor-panes {
            display: grid;
            grid-template-areas: 'html python';
            grid-template-columns: 1fr 1fr;
            height: 100%;
          }

          .editor-pane-html {
            grid-area: html;
          }

          .editor-pane-python {
            grid-area: python;
          }

          /* Reflow to a vertical layout on narrow viewports */
          @media (max-width: 768px) {
            .app-grid {
              height: auto;
            }

            .app-content {
              grid-template-areas: 'chat' 'preview';
              grid-template-columns: 1fr;
            }

            .editor-pane-html,
            .editor-pane-python {
              min-height: 300px;
            }
          }

          @media (max-width: 1400px) {
            /* On narrower viewports, tile the editors vertically */
            .editor-panes {
              grid-template-areas: 'html' 'python';
              grid-template-columns: 1fr;
            }
          }
        </style>
      </head>
      <body hx-ext="loading-states">
        <div class="app-container">
          <div class="app-grid">
            <div class="app-navbar">
              ${Navbar({
                navPage: 'course_admin',
                navSubPage: 'questions',
                resLocals,
                marginBottom: false,
              })}
            </div>
            <main id="content" class="app-content">
              <div class="app-chat p-2 bg-light border-end">
                <div class="app-chat-back mb-2">
                  <a
                    href="${resLocals.urlPrefix}/ai_generate_question_drafts"
                    class="btn btn-sm btn-ghost"
                  >
                    <i class="fa fa-arrow-left" aria-hidden="true"></i>
                    Back to draft questions
                  </a>
                </div>
                <div class="app-chat-history">
                  ${PromptHistory({
                    prompts,
                    urlPrefix: resLocals.urlPrefix,
                    showJobLogs: resLocals.is_administrator,
                  })}
                </div>
                <div class="app-chat-prompt mt-2">
                  <form
                    hx-post="${variantId
                      ? html`${resLocals.urlPrefix}/ai_generate_editor/${question.id}?variant_id=${variantId}`
                      : html`${resLocals.urlPrefix}/ai_generate_editor/${question.id}`}"
                    hx-swap="outerHTML"
                    hx-disabled-elt="button"
                  >
                    <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
                    <input type="hidden" name="__action" value="regenerate_question" />
                    <textarea
                      name="prompt"
                      id="user-prompt-llm"
                      class="form-control mb-2"
                      placeholder="What would you like to change?"
                      aria-label="Modification instructions"
                    ></textarea>
                    <!-- TODO: disable button if the input is empty -->
                    <button class="btn btn-dark w-100">
                      <span
                        class="spinner-grow spinner-grow-sm d-none mr-1"
                        role="status"
                        aria-hidden="true"
                        data-loading-class-remove="d-none"
                      ></span>
                      Adjust question
                    </button>
                  </form>
                </div>
              </div>

              <div class="app-preview">
                <div class="d-flex flex-row align-items-stretch bg-light app-preview-tabs">
                  <ul class="nav nav-tabs mr-auto pl-2 pt-2">
                    <li class="nav-item">
                      <a
                        class="nav-link active"
                        data-toggle="tab"
                        aria-current="page"
                        href="#question-preview"
                      >
                        Preview
                      </a>
                    </li>
                    <li class="nav-item">
                      <a a class="nav-link" data-toggle="tab" href="#question-code">Files</a>
                    </li>
                  </ul>
                  <div
                    class="d-flex align-items-center justify-content-end flex-grow-1 border-bottom pr-2"
                  >
                    <span data-toggle="modal" data-target="#finalizeModal">
                      <button
                        type="button"
                        class="btn btn-sm btn-primary"
                        data-toggle="tooltip"
                        title="Finalize a question to use it on assessments and make manual edits"
                      >
                        <i class="fa fa-check" aria-hidden="true"></i>
                        Finalize question
                      </button>
                    </span>
                  </div>
                </div>
                <div class="app-preview-content">
                  ${QuestionAndFilePreview({ resLocals, prompts })}
                </div>
              </div>
            </main>
          </div>
        </div>
        ${FinalizeModal({ csrfToken: resLocals.__csrf_token })}
      </body>
      <script>
        // TODO: something different on narrow viewports?
        const chatHistory = document.querySelector('.app-chat-history');
        chatHistory.scrollTop = chatHistory.scrollHeight;
      </script>
    </html>
  `.toString();
}

function QuestionAndFilePreview({
  prompts,
  resLocals,
}: {
  prompts: AiQuestionGenerationPrompt[];
  resLocals: Record<string, any>;
}) {
  return html`
    <div class="tab-content" style="height: 100%">
      <div role="tabpanel" id="question-preview" class="tab-pane active" style="height: 100%">
        <div class="question-wrapper mx-auto p-3">
          ${QuestionContainer({ resLocals, questionContext: 'instructor' })}
        </div>
      </div>
      <div role="tabpanel" id="question-code" class="tab-pane" style="height: 100%">
        ${QuestionCodePanel({
          htmlContents: prompts[prompts.length - 1].html,
          pythonContents: prompts[prompts.length - 1].python,
        })}
      </div>
    </div>
  `;
}

function PromptHistory({
  prompts,
  urlPrefix,
  showJobLogs,
}: {
  prompts: AiQuestionGenerationPrompt[];
  urlPrefix: string;
  showJobLogs: boolean;
}) {
  return prompts
    .filter((prompt) => prompt.prompt_type !== 'auto_revision')
    .map((prompt) => {
      // TODO: Once we can upgrade to Bootstrap 5.3, we can use the official
      // `bg-secondary-subtle` class instead of the custom styles here.
      return html`<div class="d-flex flex-row-reverse">
          <div class="p-3 mb-2 rounded" style="background: #e2e3e5; max-width: 90%">
            ${prompt.user_prompt}
          </div>
        </div>
        <div class="d-flex flex-row">
          <div class="p-3 mb-2 rounded" style="max-width: 90%">
            ${prompt.prompt_type === 'initial'
              ? 'We generated a potential question.'
              : 'We have made changes. Please check the preview and prompt for further revisions.'}
            <div>
              ${run(() => {
                if (!showJobLogs || !prompt.job_sequence_id) return '';

                const jobLogsUrl = urlPrefix + '/jobSequence/' + prompt.job_sequence_id;

                return html`
                  <a class="small" href="${jobLogsUrl}" target="_blank">View job logs</a>
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
    <div class="editor-panes p-2 gap-2">
      <div class="editor-pane-html d-flex flex-column border rounded" style="overflow: hidden">
        <div class="py-2 px-3 text-monospace bg-light">question.html</div>
        <div
          class="js-file-editor flex-grow-1"
          data-ace-mode="ace/mode/html"
          data-contents="${b64EncodeUnicode(htmlContents ?? '')}"
        ></div>
      </div>
      <div class="editor-pane-python d-flex flex-column border rounded" style="overflow: hidden">
        <div class="py-2 px-3 text-monospace bg-light">server.py</div>
        <div
          class="js-file-editor flex-grow-1"
          data-ace-mode="ace/mode/python"
          data-contents="${b64EncodeUnicode(pythonContents ?? '')}"
        ></div>
      </div>
    </div>
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
