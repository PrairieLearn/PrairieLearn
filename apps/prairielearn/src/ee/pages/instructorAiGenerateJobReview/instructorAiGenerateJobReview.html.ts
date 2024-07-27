import { formatDate } from '@prairielearn/formatter';
import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

import { HeadContents } from '../../../components/HeadContents.html.js';
import { JobStatus } from '../../../components/JobStatus.html.js';
import { Job } from '../../../lib/db-types.js';

export function AiGenerateJobReviewPage({
  resLocals,
  genJobs,
}: {
  resLocals: Record<string, any>;
  genJobs: Job[];
}) {
  return html` <!doctype html>
    <html lang="en">
      <head>
        ${HeadContents({ resLocals })}
      </head>
      <body hx-ext="loading-states">
        ${renderEjs(import.meta.url, "<%- include('../../../pages/partials/navbar'); %>", {
          navPage: 'course_admin',
          ...resLocals,
        })}
        <main id="content" class="container-fluid">
          <div class="card mb-4">
            <div class="card-header bg-primary text-white">Generation job history</div>
            <div class="table-responsive">
              <table class="table table-sm table-hover">
                <thead>
                  <tr>
                    <th>Number</th>
                    <th>Date</th>
                    <th>User</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${genJobs.map(
                    (job) => html`
                      <tr>
                        <td>${job.id}</td>
                        <td>
                          ${job.start_date == null
                            ? html`&mdash;`
                            : formatDate(job.start_date, resLocals.course.display_timezone)}
                        </td>
                        <td>${job.user_id ?? '(System)'}</td>
                        <td>${JobStatus({ status: job.status })}</td>
                        <td>
                          <a
                            href="${resLocals.urlPrefix}/ai_generate_question_results/${job.job_sequence_id}"
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
    </html>`.toString();
}
