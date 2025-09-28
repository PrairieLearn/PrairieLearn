import { html, unsafeHtml } from '@prairielearn/html';
import { renderHtml } from '@prairielearn/preact';
import { Hydrate } from '@prairielearn/preact/server';
import { run } from '@prairielearn/run';

import { HeadContents } from '../../../components/HeadContents.js';
import { Modal } from '../../../components/Modal.js';
import { Navbar } from '../../../components/Navbar.js';
import { QuestionContainer } from '../../../components/QuestionContainer.js';
import {
  compiledScriptTag,
  compiledStylesheetTag,
  nodeModulesAssetPath,
} from '../../../lib/assets.js';
import { b64EncodeUnicode } from '../../../lib/base64-util.js';
import { type AiQuestionGenerationPrompt, type Question } from '../../../lib/db-types.js';

import RichTextEditor from './RichTextEditor/index.js';

export function InstructorAiGenerateDraftEditor({
  resLocals,
  prompts,
  question,
  richTextEditorEnabled,
  variantId,
}: {
  resLocals: Record<string, any>;
  prompts: AiQuestionGenerationPrompt[];
  question: Question;
  richTextEditorEnabled: boolean;
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
          compiledStylesheetTag('instructorAiGenerateDraftEditor.css'),
        ]}
        <script defer src="${nodeModulesAssetPath('mathjax/es5/startup.js')}"></script>
        ${unsafeHtml(resLocals.extraHeadersHtml)}
      </head>
      <body hx-ext="loading-states">
        <div class="app-container" style="--chat-width: 400px;">
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
              <div class="d-flex flex-row align-items-center p-2 bg-light border-bottom app-back">
                <a
                  href="${resLocals.urlPrefix}/ai_generate_question_drafts"
                  class="btn btn-sm btn-ghost"
                >
                  <i class="fa fa-arrow-left" aria-hidden="true"></i>
                  Back to AI questions
                </a>
              </div>
              <div class="app-chat p-2 bg-light border-end">
                <div class="app-chat-history">
                  ${PromptHistory({
                    prompts,
                    urlPrefix: resLocals.urlPrefix,
                    csrfToken: resLocals.__csrf_token,
                    showJobLogs: resLocals.is_administrator,
                  })}
                </div>
                <div class="app-chat-prompt mt-2">
                  <form
                    class="js-revision-form"
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
                      placeholder="What would you like to revise?"
                      aria-label="Modification instructions"
                      required
                    ></textarea>
                    <button type="submit" class="btn btn-dark w-100">
                      <span
                        class="spinner-grow spinner-grow-sm d-none me-1"
                        role="status"
                        aria-hidden="true"
                        data-loading-class-remove="d-none"
                      ></span>
                      Revise question
                    </button>
                    <div class="text-muted small text-center mt-1">
                      AI can make mistakes. Review the generated question.
                    </div>
                  </form>
                </div>
                <div class="app-chat-resizer" aria-label="Resize chat" role="separator"></div>
              </div>

              <div class="d-flex flex-row align-items-stretch bg-light app-preview-tabs">
                <ul class="nav nav-tabs me-auto ps-2 pt-2">
                  <li class="nav-item">
                    <a
                      class="nav-link active"
                      data-bs-toggle="tab"
                      aria-current="page"
                      href="#question-preview"
                    >
                      Preview
                    </a>
                  </li>
                  <li class="nav-item">
                    <a a class="nav-link" data-bs-toggle="tab" href="#question-code">Files</a>
                  </li>
                  ${richTextEditorEnabled
                    ? html`
                        <li class="nav-item">
                          <a
                            class="nav-link"
                            data-bs-toggle="tab"
                            href="#question-rich-text-editor"
                          >
                            Rich Text Editor
                          </a>
                        </li>
                      `
                    : ''}
                </ul>
                <div
                  class="d-flex align-items-center justify-content-end flex-grow-1 border-bottom pe-2"
                >
                  <span data-bs-toggle="modal" data-bs-target="#finalizeModal">
                    <button
                      type="button"
                      class="btn btn-sm btn-primary"
                      data-bs-toggle="tooltip"
                      data-bs-title="Finalize a question to use it on assessments and make manual edits"
                    >
                      <i class="fa fa-check" aria-hidden="true"></i>
                      Finalize question
                    </button>
                  </span>
                </div>
              </div>
              <div class="app-preview">${QuestionAndFilePreview({ resLocals, prompts })}</div>
            </main>
          </div>
        </div>
        ${FinalizeModal({ csrfToken: resLocals.__csrf_token })}
      </body>
    </html>
  `.toString();
}

function PromptHistory({
  prompts,
  urlPrefix,
  csrfToken,
  showJobLogs,
}: {
  prompts: AiQuestionGenerationPrompt[];
  urlPrefix: string;
  csrfToken: string;
  showJobLogs: boolean;
}) {
  return prompts.map((prompt, index, filteredPrompts) => {
    // TODO: Once we can upgrade to Bootstrap 5.3, we can use the official
    // `bg-secondary-subtle` class instead of the custom styles here.
    return html`
      <div class="d-flex flex-row-reverse">
        <div class="p-3 mb-2 rounded" style="background: #e2e3e5; max-width: 90%">
          ${run(() => {
            // We'll special-case these two "prompts" and show a custom italic
            // message
            // Differentiate between actual text typed by the user and the
            // system-generated prompts.
            if (prompt.prompt_type === 'manual_revert') {
              return html`<i>Revert to an earlier revision.</i>`;
            }

            if (prompt.prompt_type === 'manual_change') {
              return html`<i>Edit the question files.</i>`;
            }

            return prompt.user_prompt;
          })}
        </div>
      </div>
      <div
        class="d-flex flex-row justify-content-start align-items-start py-3 ps-3 mb-2 prompt-response"
      >
        <div>
          ${run(() => {
            if (prompt.prompt_type === 'initial') {
              return "A new question has been generated. Review the preview and prompt for any necessary revisions. Once you're happy with the question, finalize it to use it on an assessment.";
            }

            if (prompt.prompt_type === 'manual_revert') {
              return 'The question has been reverted to an earlier revision. Make further revisions or finalize the question.';
            }

            if (prompt.prompt_type === 'manual_change') {
              return 'Your manual edits have been applied. Make further revisions or finalize the question.';
            }

            return 'The question has been revised. Make further revisions or finalize the question.';
          })}
          <div>
            ${run(() => {
              if (!showJobLogs || !prompt.job_sequence_id) return '';

              const jobLogsUrl = urlPrefix + '/jobSequence/' + prompt.job_sequence_id;

              return html`<a class="small" href="${jobLogsUrl}" target="_blank">
                View job logs
              </a>`;
            })}
          </div>
        </div>
        ${run(() => {
          // There's no point showing an option to revert to the most recent prompt.
          if (index === filteredPrompts.length - 1) return '';

          return html`
            <form method="post">
              <input type="hidden" name="__action" value="revert_edit_version" />
              <input type="hidden" name="unsafe_prompt_id" value="${prompt.id}" />
              <input type="hidden" name="__csrf_token" value="${csrfToken}" />
              <button
                type="submit"
                class="btn btn-sm btn-ghost revert-to-revision-button"
                data-bs-toggle="tooltip"
                data-bs-title="Revert to this revision"
              >
                <i class="fa fa-undo" aria-hidden="true"></i>
              </button>
            </form>
          `;
        })}
      </div>
    `;
  });
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
        ${QuestionCodeEditors({
          htmlContents: prompts[prompts.length - 1].html,
          pythonContents: prompts[prompts.length - 1].python,
          csrfToken: resLocals.__csrf_token,
        })}
      </div>
      <div role="tabpanel" id="question-rich-text-editor" class="tab-pane" style="height: 100%">
        ${renderHtml(
          <Hydrate>
            <RichTextEditor
              htmlContents={prompts[prompts.length - 1].html}
              csrfToken={resLocals.__csrf_token}
            />
          </Hydrate>,
        )}
      </div>
    </div>
  `;
}

function QuestionCodeEditors({
  htmlContents,
  pythonContents,
  csrfToken,
}: {
  htmlContents: string | null;
  pythonContents: string | null;
  csrfToken: string;
}) {
  return html`
    <div class="editor-panes p-2 gap-2">
      <!-- TODO: Move this to a more sensible location -->
      <div class="editor-pane-status">
        <div class="d-flex flex-row align-items-center justify-content-between ps-2">
          <span class="js-editor-status">No unsaved changes.</span>
          <form method="post" class="js-editor-form">
            <input type="hidden" name="__action" value="submit_manual_revision" />
            <input type="hidden" name="__csrf_token" value="${csrfToken}" />
            <button type="submit" class="btn btn-sm btn-primary">Save edits</button>
            <input
              type="hidden"
              class="js-file-editor-contents"
              name="html"
              value="${b64EncodeUnicode(htmlContents ?? '')}"
            />
            <input
              type="hidden"
              class="js-file-editor-contents"
              name="python"
              value="${b64EncodeUnicode(pythonContents ?? '')}"
            />
          </form>
        </div>
      </div>
      <div class="editor-pane-html d-flex flex-column border rounded" style="overflow: hidden">
        <div class="py-2 px-3 font-monospace bg-light">question.html</div>
        <div
          class="js-file-editor flex-grow-1"
          data-ace-mode="ace/mode/html"
          data-input-contents-name="html"
        ></div>
      </div>
      <div class="editor-pane-python d-flex flex-column border rounded" style="overflow: hidden">
        <div class="py-2 px-3 font-monospace bg-light">server.py</div>
        <div
          class="js-file-editor flex-grow-1"
          data-ace-mode="ace/mode/python"
          data-input-contents-name="python"
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
      <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
      <button class="btn btn-primary">Finalize question</button>
    `,
  });
}
