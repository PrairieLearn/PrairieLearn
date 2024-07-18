import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

import { Head } from '../../components/Head.html.js';
import { config } from '../../lib/config.js';
import type { JobSequenceWithFormattedOutput } from '../../lib/server-jobs.js';

export function EditError({
  resLocals,
  jobSequence,
  failedSync,
}: {
  resLocals: any;
  jobSequence: JobSequenceWithFormattedOutput;
  failedSync: boolean;
}) {
  const { __csrf_token } = resLocals;

  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${Head({ resLocals, pageTitle: 'Edit Failure' })}
      </head>

      <body>
        ${renderEjs(import.meta.url, "<%- include('../partials/navbar'); %>", {
          ...resLocals,
          navPage: 'error',
        })}

        <main id="content" class="container">
          <script>
            $(function () {
              const button = document.querySelector('#job-sequence-results-button');
              $('#job-sequence-results')
                .on('show.bs.collapse', () => {
                  button.textContent = 'Hide detail';
                })
                .on('hide.bs.collapse', () => {
                  button.textContent = 'Show detail';
                });
            });
          </script>

          <div class="card mb-4">
            <h5 class="card-header bg-danger text-white">
              <div class="row align-items-center justify-content-between">
                <div class="col-auto">Edit Failure</div>
                <div class="col-auto">
                  <button
                    type="button"
                    class="btn btn-light btn-sm"
                    data-toggle="collapse"
                    data-target="#job-sequence-results"
                    id="job-sequence-results-button"
                  >
                    Show detail
                  </button>
                </div>
              </div>
            </h5>
            <div class="card-body">
              <p>The file edit did not complete successfully.</p>
              ${failedSync
                ? html`
                    <p>
                      In particular, it looks like your changes were written to
                      disk${config.fileEditorUseGit
                        ? ' and were pushed to the remote GitHub repository'
                        : ''},
                      but that there was a failure to sync these changes to the database. The most
                      likely cause is broken course content. Please fix this content, then click
                      <strong>Pull from remote GitHub repository</strong> to try again.
                    </p>
                    <form method="POST">
                      <input type="hidden" name="__csrf_token" value="${__csrf_token}" />
                      <div class="mx-4">
                        <button name="__action" value="pull" class="btn btn-primary">
                          Pull from remote GitHub repository
                        </button>
                      </div>
                    </form>
                  `
                : html`<p>Please go back and try again.</p>`}
            </div>
          </div>

          <div class="collapse" id="job-sequence-results">
            ${renderEjs(import.meta.url, "<%- include('../partials/jobSequenceResults'); %>", {
              ...resLocals,
              job_sequence: jobSequence,
              job_sequence_enable_live_update: false,
            })}
          </div>
        </main>
      </body>
    </html>
  `.toString();
}
