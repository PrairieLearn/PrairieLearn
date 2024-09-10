import { z } from 'zod';

import { formatDate } from '@prairielearn/formatter';
import { html } from '@prairielearn/html';

import { HeadContents } from '../../components/HeadContents.html.js';
import { Navbar } from '../../components/Navbar.html.js';
import { GradingJobSchema, QuestionSchema, UserSchema } from '../../lib/db-types.js';

export const GradingJobRowSchema = z.object({
  // This object will have other columns, but we only care about this one
  aai: z.object({ authorized: z.boolean() }).nullable(),
  grading_job: GradingJobSchema,
  question_qid: QuestionSchema.shape.qid,
  user_uid: UserSchema.shape.uid,
});
type GradingJobRow = z.infer<typeof GradingJobRowSchema>;

export function InstructorGradingJob({
  resLocals,
  gradingJobRow,
}: {
  resLocals: Record<string, any>;
  gradingJobRow: GradingJobRow;
}) {
  const formatGradingJobDate = (date: Date | null) =>
    date
      ? formatDate(
          date,
          resLocals.course_instance?.display_timezone || resLocals.course.display_timezone,
          { includeMs: true },
        )
      : html`&mdash;`;
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${HeadContents({ resLocals, pageTitle: `Grading Job ${gradingJobRow.grading_job.id}` })}
      </head>
      <body>
        ${Navbar({ resLocals })}
        <main id="content" class="container">
          <div class="card mb-4">
            <div class="card-header bg-primary text-white">
              <h1>Grading Job ${gradingJobRow.grading_job.id}</h1>
            </div>

            <table
              class="table table-sm table-hover two-column-description"
              aria-label="Grading job details"
            >
              <tbody>
                <tr>
                  <th>Question</th>
                  <td>${gradingJobRow.question_qid}</td>
                </tr>
                <tr>
                  <th>User</th>
                  <td>${gradingJobRow.user_uid}</td>
                </tr>
                <tr>
                  <th>Requested at</th>
                  <td>${formatGradingJobDate(gradingJobRow.grading_job.grading_requested_at)}</td>
                </tr>
                <tr>
                  <th>Submitted at</th>
                  <td>${formatGradingJobDate(gradingJobRow.grading_job.grading_submitted_at)}</td>
                </tr>
                <tr>
                  <th>Received at</th>
                  <td>${formatGradingJobDate(gradingJobRow.grading_job.grading_received_at)}</td>
                </tr>
                <tr>
                  <th>Started at</th>
                  <td>${formatGradingJobDate(gradingJobRow.grading_job.grading_started_at)}</td>
                </tr>
                <tr>
                  <th>Finished at</th>
                  <td>${formatGradingJobDate(gradingJobRow.grading_job.grading_finished_at)}</td>
                </tr>
                <tr>
                  <th>Graded at</th>
                  <td>${formatGradingJobDate(gradingJobRow.grading_job.graded_at)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          ${gradingJobRow.grading_job.s3_bucket && gradingJobRow.grading_job.s3_root_key
            ? html`
                <div class="card mb-4">
                  <div class="card-header bg-primary text-white">Downloads</div>
                  <table class="table table-sm table-hover" aria-label="Grading job downloads">
                    <thead>
                      <tr>
                        <th>File</th>
                        <th>Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${resLocals.authz_data.has_course_permission_view
                        ? html` <tr>
                              <td>
                                <a
                                  href="${resLocals.urlPrefix}/grading_job/${gradingJobRow
                                    .grading_job.id}/file/job.tar.gz"
                                >
                                  job.tar.gz
                                </a>
                              </td>
                              <td>
                                Contains all files necessary for grading; this is what is mounted to
                                <code>/grade</code> when your job is run.
                              </td>
                            </tr>
                            <tr>
                              <td>
                                <a
                                  href="${resLocals.urlPrefix}/grading_job/${gradingJobRow
                                    .grading_job.id}/file/archive.tar.gz"
                                  >archive.tar.gz</a
                                >
                              </td>
                              <td>
                                A snapshot of <code>/grade</code> after your job has been executed.
                              </td>
                            </tr>`
                        : ''}
                      <tr>
                        <td>
                          <a
                            href="${resLocals.urlPrefix}/grading_job/${gradingJobRow.grading_job
                              .id}/file/results.json"
                            >results.json</a
                          >
                        </td>
                        <td>
                          Contains the PrairieLearn-generated results, which includes the contents
                          of your
                          <code>results.json</code> as well as some PrairieLearn metadata.
                        </td>
                      </tr>
                      <tr>
                        <td>
                          <a
                            href="${resLocals.urlPrefix}/grading_job/${gradingJobRow.grading_job
                              .id}/file/output.log"
                            >output.log</a
                          >
                        </td>
                        <td>
                          Contains the raw output from stdout/stderr for your job. Lines beginning
                          with
                          <code>container &gt;</code> are from your container; the rest are
                          diagnostic logs from PrairieLearn.
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              `
            : ''}

          <div class="card mb-4">
            <div class="card-header bg-primary text-white">Job Output</div>
            <div class="card-body">
              ${gradingJobRow.grading_job.s3_bucket && gradingJobRow.grading_job.s3_root_key
                ? html`
                    <script>
                      $(() => {
                        const outputUrl = document.getElementById('job-output').dataset.outputUrl;

                        $.get(outputUrl)
                          .done(function (data) {
                            $('#job-output-loading').hide();
                            $('#job-output').text(data);
                            $('#job-output').show();
                          })
                          .fail(function () {
                            $('#job-output-loading').hide();
                            $('#job-output').text('Unable to load grader results');
                            $('#job-output').show();
                          });
                      });
                    </script>
                    <pre
                      class="bg-dark text-white rounded p-3 mb-0"
                      id="job-output"
                      style="display: none;"
                      data-output-url="${resLocals.urlPrefix}/grading_job/${gradingJobRow
                        .grading_job.id}/file/output.log"
                    ></pre>
                    <div id="job-output-loading" class="w-100 text-center">
                      <i class="fa fa-spinner fa-spin fa-2x"></i>
                    </div>
                  `
                : gradingJobRow.grading_job.output
                  ? html`
                      <pre class="bg-dark text-white rounded p-3 mb-0" id="job-output">
${gradingJobRow.grading_job.output}</pre
                      >
                    `
                  : html`
                      <pre class="bg-dark text-white rounded p-3 mb-0">
No output was captured for this grading job.</pre
                      >
                    `}
            </div>
          </div>
        </main>
      </body>
    </html>
  `.toString();
}
