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

export const examplePrompts = [
  {
    id: 'dot-product',
    name: 'Dot product of two vectors',
    promptGeneral:
      'Generate a question by randomly creating two vectors (e.g., 3-dimensional). Ask the student to calculate the dot product of these vectors. Include the vector components in the prompt..',
    promptUserInput:
      'Provide a single numeric input field for the computed dot product..',
    promptGrading:
      'Calculate the dot product of the two vectors internally and compare it with the student’s submitted value.',
  },
  {
    id: 'select-median-of-random-numbers',
    name: 'Median of random numbers',
    promptGeneral:
      'Write a multiple choice question asking the user to choose the median of 5 random numbers between 1 and 100. Display all numbers to the user, and ask them to choose the median.',
    promptUserInput:
      'Each random number generated should be a potential answer to the multiple-choice question. Randomize the order of the numbers.',
    promptGrading: 'The correct answer is the median of the numbers.',
  },
  {
    id: 'properties-of-binary-search-tree',
    name: 'Properties of a binary search tree',
    promptGeneral:
      "Generate a multiple-choice question testing a student's knowledge on the properties of binary search trees. Include one correct answer and several incorrect ones.",
    promptUserInput:
      'Display the answer options as radio buttons for a single selection.',
    promptGrading:
      "Predefine the correct property and compare the student's selected option with the correct answer.",
  },
  {
    id: 'bit-shifting',
    name: 'Bit shifting',
    promptGeneral:
      'Generate a question where an arbitrarily-generated bit string is provided along with instructions to shift the bits either to the left or to the right by a specified number of positions. The prompt should include the original bit string, the direction of the shift, and the number of positions to shift. This should be a logical shift. The number of positions to shift by should be randomized.',
    promptUserInput:
      'Provide a text input box where students can type the resulting bit string after performing the specified bit shifting operation.',
    promptGrading:
      "Internally perform the given bit shift on the generated bit string and compare the resulting bit string with the student's input.",
  },
  {
    id: 'projectile-distance',
    name: 'Calculate projectile distance',
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

            ${SampleQuestionSelector()}

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
                <em>  
                  Example: ${examplePrompts[0].promptGeneral}
                </em>
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
                  <em>
                    Example: ${examplePrompts[0].promptUserInput}
                  </em>
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
                  <em>
                    Example: ${examplePrompts[0].promptGrading} 
                  </em>
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


function SampleQuestionSelector() {

  // TODO: Check if the user has any questions generated. If so, start collapsed.

  return html`

    <div class="accordion my-3" id="accordionExample">
      <div class="accordion-item">
        <h2 class="accordion-header" id="headingOne">
          <button class="accordion-button" type="button" data-bs-toggle="collapse" data-bs-target="#collapseOne" aria-expanded="true" aria-controls="collapseOne">
            Example questions and prompts
          </button>
        </h2>
        <div id="collapseOne" class="accordion-collapse collapse show" aria-labelledby="headingOne" data-bs-parent="#accordionExample">
          <div class="accordion-body">
            <ul class="nav nav-pills" id="user-visual-example-tab" role="tablist">
              ${examplePrompts.map((examplePrompt, index) => (
                html`
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
                      data-prompt-general="${examplePrompt.promptGeneral}"
                      data-prompt-user-input="${examplePrompt.promptUserInput}"
                      data-prompt-grading="${examplePrompt.promptGrading}"
                    >
                      ${examplePrompt.name}
                    </button>
                  </li>
                `
              ))}
            </ul>
            <div class="tab-content pt-3" id="myPillContent">
              ${examplePrompts.map((examplePrompt, index) => (
                html`
                <div 
                  class="tab-pane ${index === 0 ? 'show active' : ''}" 
                  id="${examplePrompt.id}" 
                  role="tabpanel" 
                  aria-labelledby="${examplePrompt.id}-pill"
                >
                  
                  ${SampleQuestionPreview(
                    examplePrompt.id
                  )}
                </div>
                `
              ))}
              <button
                id="copy-prompts"
                type="button"
                class="btn btn-primary me-2 mt-3"
              >
                <i class="fa fa-clone" aria-hidden="true"></i>
                Copy prompts
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `
}

function SampleQuestionPreview(
  id: string
) {

  const examplePrompt = examplePrompts.find((prompt) => prompt.id === id);

  if (!examplePrompt) {
    return html`<div>Invalid example prompt</div>`;
  }

  return html`
    <div class="card shadow">
      <div class="card-header d-flex align-items-center">
        <span class="badge rounded-pill bg-success me-3">Try me!</span>
        ${examplePrompt.name}
      </div>
      <div class="card-body">
        <p>
          Suppose a ball is thrown from a level surface at a [angle]° angle with
          a velocity of [velocity] m/s. How far will the ball travel?
        </p>
        <span class="input-group">
          <input
            type="text"
            class="form-control"
          />
          <span class="input-group-text">
            <span class="me-2">m</span>
            <span class="badge bg-success">100%</span>
          </span>
        </span>
      </div>
      <div class="card-footer d-flex justify-content-end">
        <button
          type="button"
          class="btn btn-primary me-2"
        >
          New variant
        </button>
        <button type="button" class="btn btn-primary">
          Grade
        </button>
      </div>
    </div>
  `
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
