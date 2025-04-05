import { z } from 'zod';

import { compiledScriptTag } from '@prairielearn/compiled-assets';
import { formatDate } from '@prairielearn/formatter';
import { html } from '@prairielearn/html';

import { Modal } from '../../../components/Modal.html.js';
import { PageLayout } from '../../../components/PageLayout.html.js';
import { type ExamplePrompt, examplePrompts } from '../../../lib/aiGeneratedQuestionSamples.js';
import { DraftQuestionMetadataSchema, IdSchema } from '../../../lib/db-types.js';

// We show all draft questions, even those without associated metadata, because we
// won't have metadata for a draft question if it was created on and synced from
// another instance of PrairieLearn, including from local dev.
export const DraftMetadataWithQidSchema = z.object({
  draft_question_metadata: DraftQuestionMetadataSchema.nullable(),
  question_id: IdSchema,
  qid: z.string(),
  uid: z.string().nullable(),
});
export type DraftMetadataWithQid = z.infer<typeof DraftMetadataWithQidSchema>;

export function InstructorAIGenerateDrafts({
  resLocals,
  drafts,
}: {
  resLocals: Record<string, any>;
  drafts: DraftMetadataWithQid[];
}) {
  const hasDrafts = drafts.length > 0;

  return PageLayout({
    resLocals,
    pageTitle: resLocals.pageTitle,
    headContent: html`
      ${compiledScriptTag('instructorAiGenerateDraftsClient.ts')}
      ${compiledScriptTag('instructorAiGenerateDraftsQuestionPreviewClient.ts')}
      <style>
        .reveal-fade {
          position: absolute;
          bottom: 0;
          left: 0;
          width: 100%;
          height: 6rem;
          background: linear-gradient(to bottom, transparent, var(--bs-light));
          pointer-events: none;
        }
      </style>
    `,
    options: {
      hxExt: 'loading-states',
    },
    navContext: {
      type: 'instructor',
      page: 'course_admin',
      subPage: 'questions',
    },
    content: html`
      <div class="mb-3">
        <a href="${resLocals.urlPrefix}/course_admin/questions" class="btn btn-sm btn-primary">
          <i class="fa fa-arrow-left" aria-hidden="true"></i>
          Back to all questions
        </a>
      </div>
      <div
        id="add-question-card"
        class="card mb-5 mx-auto overflow-hidden"
        style="max-width: 700px"
      >
        <div class="card-body position-relative">
          <h1 class="h3 text-center">Generate a new question with AI</h1>
          <form
            id="add-question-form"
            name="add-question-form"
            hx-post="${resLocals.urlPrefix}/ai_generate_question_drafts"
            hx-target="#generation-results"
            hx-swap="outerHTML"
            hx-disabled-elt="button"
          >
            <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
            <input type="hidden" name="__action" value="generate_question" />

            ${SampleQuestionSelector({
              startPrompt: examplePrompts[0],
              startOpen: true,
            })}

            <div class="mb-3">
              <label class="form-label" for="user-prompt-llm">
                Give a high-level overview of the question. What internal parameters need to be
                generated and what information should be provided to students?
              </label>
              <textarea
                name="prompt"
                id="user-prompt-llm"
                class="form-control js-textarea-autosize"
                style="resize: none;"
              ></textarea>
              <div id="user-prompt-llm-example" class="form-text form-muted">
                <em> Example: ${examplePrompts[0].promptGeneral} </em>
              </div>
            </div>

            <div class="js-hidden-inputs-container ${hasDrafts ? 'd-none' : ''}">
              <div class="mb-3">
                <label class="form-label" for="user-prompt-llm-user-input">
                  How should students input their solution? What choices or input boxes are they
                  given?
                </label>
                <textarea
                  name="prompt_user_input"
                  id="user-prompt-llm-user-input"
                  class="form-control js-textarea-autosize"
                  style="resize: none;"
                ></textarea>
                <div id="user-prompt-llm-user-input-example" class="form-text form-muted">
                  <em> Example: ${examplePrompts[0].promptUserInput} </em>
                </div>
              </div>

              <div class="mb-3">
                <label class="form-label" for="user-prompt-llm-grading">
                  How is the correct answer determined?
                </label>
                <textarea
                  name="prompt_grading"
                  id="user-prompt-llm-grading"
                  class="form-control js-textarea-autosize"
                  style="resize: none;"
                ></textarea>
                <div id="user-prompt-llm-grading-example" class="form-text form-muted">
                  <em> Example: ${examplePrompts[0].promptGrading} </em>
                </div>
              </div>

              <button type="submit" class="btn btn-primary w-100">
                <span
                  class="spinner-grow spinner-grow-sm d-none me-1"
                  role="status"
                  aria-hidden="true"
                  data-loading-class-remove="d-none"
                >
                </span>
                Create question
              </button>

              <div class="text-muted small text-center mt-2">
                AI can make mistakes. Review the generated question.
              </div>

              <div id="generation-results"></div>
            </div>
          </form>
          ${hasDrafts ? html`<div class="reveal-fade"></div>` : ''}
        </div>
        ${hasDrafts
          ? html`
              <div class="p-2 d-flex justify-content-center bg-light js-expand-button-container">
                <button type="button" class="btn btn-sm btn-link">Expand</button>
              </div>
            `
          : ''}
      </div>
      ${hasDrafts
        ? html`
            <div class="d-flex flex-row align-items-center justify-content-between mb-2">
              <h1 class="h5 mb-0">Continue working on a draft question</h1>
              <button
                class="btn btn-sm btn-outline-danger ms-2"
                data-bs-toggle="modal"
                data-bs-target="#deleteModal"
              >
                <i class="fa fa-trash" aria-hidden="true"></i>
                <span class="d-none d-sm-inline">Delete all drafts</span>
              </button>
            </div>
            <div class="card">
              <div class="table-responsive">
                <table class="table table-sm table-hover" aria-label="AI question generation jobs">
                  <thead>
                    <tr>
                      <th>QID</th>
                      <th>Created At</th>
                      <th>Created By</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${drafts.map(
                      (row) => html`
                        <tr>
                          <td>${row.qid}</td>
                          <td>
                            ${row.draft_question_metadata?.created_at == null
                              ? html`&mdash;`
                              : formatDate(
                                  row.draft_question_metadata.created_at,
                                  resLocals.course.display_timezone,
                                )}
                          </td>
                          <td>${row.uid ?? '(System)'}</td>
                          <td>
                            <a
                              href="${resLocals.urlPrefix}/ai_generate_editor/${row.question_id}"
                              class="btn btn-xs btn-primary"
                            >
                              Continue editing
                            </a>
                          </td>
                        </tr>
                      `,
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          `
        : ''}
      ${DeleteQuestionsModal({ csrfToken: resLocals.__csrf_token })}
    `,
  });
}

function SampleQuestionSelector({
  startPrompt,
  startOpen,
}: {
  startPrompt: ExamplePrompt;
  startOpen: boolean;
}) {
  return html`
    <div class="accordion my-3" id="sample-question-accordion">
      <div class="accordion-item">
        <h2 class="accordion-header" id="sample-question-accordion-content">
          <button
            class="accordion-button"
            type="button"
            data-bs-toggle="collapse"
            data-bs-target="#sample-question-content"
            aria-expanded="${startOpen ? 'true' : ''}"
            aria-controls="sample-question-content"
          >
            Example questions and prompts
          </button>
        </h2>
        <div
          id="sample-question-content"
          class="accordion-collapse ${startOpen ? 'show' : 'collapse'}"
          aria-labelledby="sample-question-content"
          data-bs-parent="#sample-question-accordion"
        >
          <div class="accordion-body">
            <ul class="nav nav-pills" id="example-question-selector" role="tablist">
              ${examplePrompts.map(
                (examplePrompt, index) => html`
                  <li class="nav-item" role="presentation">
                    <button
                      class="nav-link ${index === 0 ? 'active' : ''}"
                      id="${examplePrompt.id}-pill"
                      data-bs-toggle="pill"
                      data-bs-target="#${examplePrompt.id}"
                      type="button"
                      role="tab"
                      aria-controls="home"
                      aria-selected="${index === 0 ? 'true' : ''}"
                      data-id="${examplePrompt.id}"
                      data-name="${examplePrompt.name}"
                      data-prompt-general="${examplePrompt.promptGeneral}"
                      data-prompt-user-input="${examplePrompt.promptUserInput}"
                      data-prompt-grading="${examplePrompt.promptGrading}"
                    >
                      ${examplePrompt.name}
                    </button>
                  </li>
                `,
              )}
            </ul>

            <div class="tab-content pt-3">
              ${SampleQuestionPreview(startPrompt)}
              <button id="copy-prompts" type="button" class="btn btn-primary me-2 mt-3">
                <i class="fa fa-clone" aria-hidden="true"></i>
                Copy prompts
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function SampleQuestionPreview(startPrompt: ExamplePrompt) {
  // TODO: Immediately generate the starting prompt content
  return html`
    <div class="card shadow">
      <div class="card-header d-flex align-items-center">
        <span class="badge rounded-pill bg-success me-3">Try me!</span>
        <p id="question-preview-name" class="mb-0">${startPrompt.name}</p>
      </div>
      <div class="card-body">
        <div id="question-content"></div>
        <span class="input-group">
          <span id="question-preview-answer-name-container" class="input-group-text">
            <span id="question-preview-answer-name">${startPrompt.answerName ? `${startPrompt.answerName} = ` : ''}</span>
          </span>
          <input id="question-preview-response" type="text" class="form-control" />
          <span id="grade-answer-units-feedback-container" class="input-group-text gap-3 ${!startPrompt.answerUnits ? 'd-none' : ''}">
            <span id="grade-answer-units">${startPrompt.answerUnits}</span>
            <span id="grade-answer-feedback" class="badge bg-success">100%</span>
          </span>
        </span>
      </div>
      <div class="card-footer d-flex justify-content-end">
        <button id="question-preview-new-variant-button" type="button" class="btn btn-primary me-2">
          New variant
        </button>
        <button id="question-preview-grade-button" type="button" class="btn btn-primary">
          Grade
        </button>
      </div>
    </div>
  `;
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

function DeleteQuestionsModal({ csrfToken }: { csrfToken: string }) {
  return Modal({
    id: 'deleteModal',
    title: 'Delete all draft questions',
    body: 'Are you sure you want to permanently delete all draft questions?',
    footer: html`
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <button type="submit" class="btn btn-danger" name="__action" value="delete_drafts">
        <i class="fa fa-trash" aria-hidden="true"></i>
        Delete all drafts
      </button>
      <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
    `,
  });
}
