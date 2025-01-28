import { z } from 'zod';

import { compiledScriptTag } from '@prairielearn/compiled-assets';
import { formatDate } from '@prairielearn/formatter';
import { html } from '@prairielearn/html';

import { HeadContents } from '../../../components/HeadContents.html.js';
import { Navbar } from '../../../components/Navbar.html.js';
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
    promptGeneral:
      'Write a multiple choice question asking the user to choose the median of 5 random numbers between 1 and 100. Display all numbers to the user, and ask them to choose the median.',
    promptUserInput:
      'Each random number generated should be a potential answer to the multiple-choice question. Randomize the order of the numbers.',
    promptGrading: 'The correct answer is the median of the numbers.',
  },
  {
    id: 'Multiply random integers',
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

export function InstructorAIGenerateDrafts({
  resLocals,
  drafts,
}: {
  resLocals: Record<string, any>;
  drafts: DraftMetadataWithQid[];
}) {
  const hasDrafts = drafts.length > 0;

  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${[HeadContents({ resLocals }), compiledScriptTag('instructorAiGenerateDraftsClient.ts')]}
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
      </head>
      <body hx-ext="loading-states">
        ${Navbar({ navPage: 'course_admin', navSubPage: 'questions', resLocals })}
        <main id="content" class="container mb-4">
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

                <div class="form-group">
                  <label for="user-prompt-llm">
                    Give a high-level overview of the question. What internal parameters need to be
                    generated and what information should be provided to students?
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
                      selected at random between 1 and 2 meters. V0 is a an integer between 1 and 4
                      m/s. How long does it take for the car to reach the ground?
                    </em>
                  </div>
                </div>

                <div class="js-hidden-inputs-container ${hasDrafts ? 'd-none' : ''}">
                  <div class="form-group">
                    <label for="user-prompt-llm-user-input">
                      How should students input their solution? What choices or input boxes are they
                      given?
                    </label>
                    <textarea
                      name="prompt_user_input"
                      id="user-prompt-llm-user-input"
                      class="form-control js-textarea-autosize"
                      style="resize: none;"
                    ></textarea>
                    <div class="form-text form-muted">
                      <em>
                        Example: students should enter the solution using a decimal number. The
                        answer should be in seconds.
                      </em>
                    </div>
                  </div>

                  <div class="form-group">
                    <label for="user-prompt-llm-grading">
                      How is the correct answer determined?
                    </label>
                    <textarea
                      name="prompt_grading"
                      id="user-prompt-llm-grading"
                      class="form-control js-textarea-autosize"
                      style="resize: none;"
                    ></textarea>
                    <div class="form-text form-muted">
                      <em>
                        Example: the answer is computed as sqrt(2 * h / g) where g = 9.81 m/s^2
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
                            <select id="user-prompt-example" class="custom-select">
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
                        `
                      : ''
                  }

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

                  <div id="generation-results"></div>
                </div>
              </form>
              ${hasDrafts ? html`<div class="reveal-fade"></div>` : ''}
            </div>
            ${hasDrafts
              ? html`
                  <div
                    class="p-2 d-flex justify-content-center bg-light js-expand-button-container"
                  >
                    <button type="button" class="btn btn-sm btn-link">Expand</button>
                  </div>
                `
              : ''}
          </div>
          ${hasDrafts
            ? html`
                <h1 class="h5">Continue working on a draft question</h1>
                <div class="card">
                  <div class="table-responsive">
                    <table
                      class="table table-sm table-hover"
                      aria-label="AI question generation jobs"
                    >
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
        </main>
      </body>
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
