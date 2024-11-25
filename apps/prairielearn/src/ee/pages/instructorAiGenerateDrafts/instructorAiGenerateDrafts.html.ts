import { z } from 'zod';

import { formatDate } from '@prairielearn/formatter';
import { html } from '@prairielearn/html';

import { HeadContents } from '../../../components/HeadContents.html.js';
import { Navbar } from '../../../components/Navbar.html.js';
import { DateFromISOString, IdSchema } from '../../../lib/db-types.js';

export const draftMetadataWithQidSchema = z.object({
  created_at: DateFromISOString.nullable(),
  created_by: IdSchema.nullable(),
  id: IdSchema,
  uid: z.string().nullable(),
  question_id: IdSchema.nullable(),
  updated_by: IdSchema.nullable(),
  qid: z.string().nullable(),
});
export type DraftMetadataWithQid = z.infer<typeof draftMetadataWithQidSchema>;

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
        <main id="content" class="container-fluid">
          <div class="card mb-4">
            <div class="card-header bg-primary text-white">AI Generation Draft Questions</div>
            <div class="table-responsive">
              <table class="table table-sm table-hover" aria-label="AI question generation jobs">
                <thead>
                  <tr>
                    <th>Draft ID</th>
                    <th>Created At</th>
                    <th>Created By</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${drafts.map(
                    (row) => html`
                      <tr>
                        <td>${row.qid ?? html`&mdash;`}</td>
                        <td>
                          ${row.created_at == null
                            ? html`&mdash;`
                            : formatDate(row.created_at, resLocals.course.display_timezone)}
                        </td>
                        <td>${row.uid ?? '(System)'}</td>
                        ${row.qid
                          ? html`<td>
                              <a
                                href="${resLocals.urlPrefix}/ai_generate_question?qid=${row.qid.substring(
                                  11,
                                )}"
                                class="btn btn-xs btn-info"
                              >
                                Keep Editing
                              </a>
                            </td>`
                          : html`<td>Not available</td>`}
                      </tr>
                    `,
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </body>
    </html>
  `.toString();
}
