import { z } from 'zod';

import { formatDate } from '@prairielearn/formatter';
import { html } from '@prairielearn/html';

import { HeadContents } from '../../../components/HeadContents.html.js';
import { Modal } from '../../../components/Modal.html.js';
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

export function InstructorAIGenerateDrafts({
  resLocals,
  drafts,
}: {
  resLocals: Record<string, any>;
  drafts: DraftMetadataWithQid[];
}) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${HeadContents({ resLocals })}
      </head>
      <body>
        ${Navbar({ navPage: 'course_admin', navSubPage: 'questions', resLocals })}
        <main id="content" class="container mb-4">
          <div class="mb-3">
            <a href="${resLocals.urlPrefix}/course_admin/questions" class="btn btn-sm btn-primary">
              <i class="fa fa-arrow-left" aria-hidden="true"></i>
              Back to all questions
            </a>
          </div>
          <div class="card">
            <div
              class="card-header bg-primary text-white d-flex align-items-center justify-content-between"
            >
              AI Generation Draft Questions
              <div class="d-flex flex-row">
                ${drafts.length > 0
                  ? html`
                      <button
                        class="btn btn-sm btn-light mr-2"
                        data-toggle="modal"
                        data-target="#destroyModal"
                      >
                        <i class="fa fa-trash" aria-hidden="true"></i>
                        <span class="d-none d-sm-inline">Delete all drafts</span>
                      </button>
                    `
                  : ''}
                <a href="${resLocals.urlPrefix}/ai_generate_question" class="btn btn-sm btn-light">
                  <i class="fa fa-wand-magic-sparkles" aria-hidden="true"></i>
                  <span class="d-none d-sm-inline">Generate question with AI</span>
                </a>
              </div>
            </div>
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

              ${DestroyQuestionsModal(resLocals)}
            </div>
          </div>
        </main>
      </body>
    </html>
  `.toString();
}

function DestroyQuestionsModal(resLocals) {
  return Modal({
    id: 'destroyModal',
    title: 'Delete all draft questions',
    body: html` This will permamently and unrecoverably delete all of the draft questions. `,
    footer: html`
      <form method="POST" class="mr-2">
        <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
        <button class="btn btn-danger" name="__action" value="delete_drafts">
          <i class="fa fa-trash" aria-hidden="true"></i>
          <span class="d-none d-sm-inline">Delete all drafts</span>
        </button>
        <button type="button" class="btn btn-secondary" data-dismiss="modal">Close</button>
      </form>
    `,
  });
}
