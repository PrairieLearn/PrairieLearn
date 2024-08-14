import { z } from 'zod';

import { formatDate } from '@prairielearn/formatter';
import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

import { HeadContents } from '../../../components/HeadContents.html.js';
import { JobStatus } from '../../../components/JobStatus.html.js';
import { JobSchema, UserSchema } from '../../../lib/db-types.js';

export const JobRowSchema = z.object({
  job: JobSchema,
  user: UserSchema.nullable(),
});

type JobRow = z.infer<typeof JobRowSchema>;

export function InstructorAIGenerateJobs({
  resLocals,
  jobs,
}: {
  resLocals: Record<string, any>;
  jobs: JobRow[];
}) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${HeadContents({ resLocals })}
      </head>
      <body>
        ${renderEjs(import.meta.url, "<%- include('../../../pages/partials/navbar'); %>", {
          navPage: 'course_admin',
          navSubPage: 'questions',
          ...resLocals,
        })}
        <main id="content" class="container-fluid">
          <div class="card mb-4">
            <div class="card-header bg-primary text-white">Generation job history</div>
            <div class="table-responsive">
              <table class="table table-sm table-hover">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>User</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${jobs.map(
                    (row) => html`
                      <tr>
                        <td>
                          ${row.job.start_date == null
                            ? html`&mdash;`
                            : formatDate(row.job.start_date, resLocals.course.display_timezone)}
                        </td>
                        <td>${row.user?.uid ?? '(System)'}</td>
                        <td>${JobStatus({ status: row.job.status })}</td>
                        <td>
                          <a
                            href="${resLocals.urlPrefix}/ai_generate_question_job/${row.job
                              .job_sequence_id}"
                            class="btn btn-xs btn-info"
                          >
                            Details
                          </a>
                        </td>
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
