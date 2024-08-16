import { html } from '@prairielearn/html';

import { HeadContents } from '../../components/HeadContents.html.js';
import { JobSequenceResults } from '../../components/JobSequenceResults.html.js';
import { Navbar } from '../../components/Navbar.html.js';
import { config } from '../../lib/config.js';
import type { JobSequenceWithTokens } from '../../lib/server-jobs.types.js';

export function EditError({
  resLocals,
  jobSequence,
  failedSync,
}: {
  resLocals: any;
  jobSequence: JobSequenceWithTokens;
  failedSync: boolean;
}) {
  const { course, __csrf_token } = resLocals;

  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${HeadContents({ resLocals, pageTitle: 'Edit Failure' })}
      </head>

      <body>
        ${Navbar({ resLocals, navPage: 'error' })}

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
            <div class="card-header bg-danger text-white d-flex align-items-center">
              <h1>Edit Failure</h1>
              <button
                type="button"
                class="btn btn-light btn-sm ml-auto"
                data-toggle="collapse"
                data-target="#job-sequence-results"
                id="job-sequence-results-button"
              >
                Show detail
              </button>
            </div>
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
            ${JobSequenceResults({ course, jobSequence })}
          </div>
        </main>
      </body>
    </html>
  `.toString();
}
