import { z } from 'zod';

import { compiledScriptTag } from '@prairielearn/compiled-assets';
import { formatDate } from '@prairielearn/formatter';
import { html } from '@prairielearn/html';

import { Modal } from '../../../components/Modal.html.js';
import { PageLayout } from '../../../components/PageLayout.html.js';
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

const examplePrompts = [
  {
    id: 'Select median of 5 random numbers',
    prompt:
      'Write a multiple choice question asking the user to choose the median of 5 random numbers between 1 and 100. Display all numbers to the user, and ask them to choose the median.',
  },
  {
    id: 'Multiply random integers',
    prompt:
      'Write a question that asks the user to multiply two integers. You should randomly generate two integers A and B, display them to the user, and then ask the user to provide the product C = A * B.',
  },
  {
    id: 'Answer to Ultimate Question',
    prompt:
      'Write a question asking "What Is The Answer to the Ultimate Question of Life, the Universe, and Everything?".',
  },
  {
    id: 'Calculate Projectile Distance',
    prompt:
      'Write a question that asks the user to calculate how far a projectile will be launched. Display to the user an angle randomly generated between 30 and 60 degrees, and a velocity randomly generated between 10 and 20 m/s, and ask for the distance (in meters) that the object travels assuming no wind resistance.',
  },
];

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

            <div class="mb-3">
              <label class="form-label" for="user-prompt-llm">
                Give a high-level overview of the question, including what parameters should be
                generated and how students should provide their response.
              </label>
              <textarea
                name="prompt"
                id="user-prompt-llm"
                class="form-control js-textarea-autosize"
                style="resize: none;"
              ></textarea>
              <div class="form-text form-muted">
                <em>
                  Example: A toy car is pushed off a table with height h at speed v0. Assume
                  acceleration due to gravity as 9.81 m/s^2. H is a number with 1 decimal digit
                  selected at random between 1 and 2 meters. V0 is a an integer between 1 and 4 m/s.
                  How long does it take for the car to reach the ground?
                </em>
              </div>
            </div>

            ${
              // We think this will mostly be useful in local dev or for
              // global admins who will want to iterate rapidly and don't
              // want to retype a whole prompt each time. For actual users,
              // we think this will mostly be confusing if we show it.
              resLocals.is_administrator
                ? html`
                    <hr />

                    <div class="mb-3">
                      <label for="user-prompt-example" class="form-label">
                        Or choose an example prompt:
                      </label>
                      <select id="user-prompt-example" class="form-select">
                        <option value=""></option>
                        ${examplePrompts.map(
                          (question) =>
                            html`<option value="${question.id}" data-prompt="${question.prompt}">
                              ${question.id}
                            </option>`,
                        )}
                      </select>
                    </div>
                  `
                : ''
            }

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
          </form>
        </div>
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

export function RateLimitExceeded({
  canShortenMessage = false,
}: {
  /**
   * If true, shows that the user should shorten their message to stay under the rate limit.
   */
  canShortenMessage: boolean;
}): string {
  return html`
    <div id="generation-results">
      <div class="alert alert-danger mt-2 mb-0">
        ${canShortenMessage
          ? 'Your prompt is too long. Please shorten it and try again.'
          : "You've reached the hourly usage cap for AI question generation. Please try again later."}
      </div>
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
