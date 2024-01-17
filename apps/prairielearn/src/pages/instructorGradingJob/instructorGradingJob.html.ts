import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';
import { z } from 'zod';

import { IdSchema } from '../../lib/db-types';

const GradingJobSchema = z.object({
  id: IdSchema,
  s3_bucket: z.string().nullable(),
  s3_root_key: z.string().nullable(),
  output: z.string().nullable(),
});

export const GradingJobQueryResultSchema = z.object({
  aai: z.record(z.any()).nullable(),
  grading_job: GradingJobSchema,
  formatted_grading_requested_at: z.string().nullable(),
  formatted_grading_submitted_at: z.string().nullable(),
  formatted_grading_received_at: z.string().nullable(),
  formatted_grading_started_at: z.string().nullable(),
  formatted_grading_finished_at: z.string().nullable(),
  formatted_graded_at: z.string().nullable(),
  question_qid: z.string(),
  user_uid: z.string(),
});
type GradingJobQueryResult = z.infer<typeof GradingJobQueryResultSchema>;

export function InstructorGradingJob({
  resLocals,
  gradingJobQueryResult,
}: {
  resLocals: Record<string, any>;
  gradingJobQueryResult: GradingJobQueryResult;
}) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${renderEjs(__filename, "<%- include('../partials/head') %>", {
          ...resLocals,
          pageTitle: `Grading Job ${gradingJobQueryResult.grading_job.id}`,
        })}
      </head>
      <body>
        ${renderEjs(__filename, "<%- include('../partials/navbar') %>", {
          ...resLocals,
          navPage: '',
        })}
        <main id="content" class="container">
          <div class="card mb-4">
            <div class="card-header bg-primary text-white">
              Grading Job ${gradingJobQueryResult.grading_job.id}
            </div>

            <table class="table table-sm table-hover two-column-description">
              <tbody>
                <tr>
                  <th>Question</th>
                  <td>${gradingJobQueryResult.question_qid}</td>
                </tr>
                <tr>
                  <th>User</th>
                  <td>${gradingJobQueryResult.user_uid}</td>
                </tr>
                <tr>
                  <th>Requested at</th>
                  <td>${gradingJobQueryResult.formatted_grading_requested_at}</td>
                </tr>
                <tr>
                  <th>Submitted at</th>
                  <td>${gradingJobQueryResult.formatted_grading_submitted_at}</td>
                </tr>
                <tr>
                  <th>Received at</th>
                  <td>${gradingJobQueryResult.formatted_grading_received_at}</td>
                </tr>
                <tr>
                  <th>Started at</th>
                  <td>${gradingJobQueryResult.formatted_grading_started_at}</td>
                </tr>
                <tr>
                  <th>Finished at</th>
                  <td>${gradingJobQueryResult.formatted_grading_finished_at}</td>
                </tr>
                <tr>
                  <th>Graded at</th>
                  <td>${gradingJobQueryResult.formatted_graded_at}</td>
                </tr>
              </tbody>
            </table>
          </div>

          ${gradingJobQueryResult.grading_job.s3_bucket &&
          gradingJobQueryResult.grading_job.s3_root_key
            ? html`
                <div class="card mb-4">
                  <div class="card-header bg-primary text-white">Downloads</div>
                  <table class="table table-sm table-hover">
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
                                  href="${resLocals.urlPrefix}/grading_job/${gradingJobQueryResult
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
                                  href="${resLocals.urlPrefix}/grading_job/${gradingJobQueryResult
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
                            href="${resLocals.urlPrefix}/grading_job/${gradingJobQueryResult
                              .grading_job.id}/file/results.json"
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
                            href="${resLocals.urlPrefix}/grading_job/${gradingJobQueryResult
                              .grading_job.id}/file/output.log"
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
              ${gradingJobQueryResult.grading_job.s3_bucket &&
              gradingJobQueryResult.grading_job.s3_root_key
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
                      data-output-url="${resLocals.urlPrefix}/grading_job/${gradingJobQueryResult
                        .grading_job.id}/file/output.log"
                    ></pre>
                    <div id="job-output-loading" class="w-100 text-center">
                      <i class="fa fa-spinner fa-spin fa-2x"></i>
                    </div>
                  `
                : gradingJobQueryResult.grading_job.output
                  ? html`
                      <pre class="bg-dark text-white rounded p-3 mb-0" id="job-output">
${gradingJobQueryResult.grading_job.output}</pre
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
