import { compiledScriptTag } from '@prairielearn/compiled-assets';
import { html } from '@prairielearn/html';

import { JobSequenceResults } from '../../components/JobSequenceResults.js';
import { PageLayout } from '../../components/PageLayout.js';
import { config } from '../../lib/config.js';
import type { JobSequenceWithTokens } from '../../lib/server-jobs.types.js';

export function EditError({
  resLocals,
  jobSequence,
  failedSync,
  hadJsonErrors,
}: {
  resLocals: any;
  jobSequence: JobSequenceWithTokens;
  failedSync: boolean;
  hadJsonErrors: boolean;
}) {
  const { course, __csrf_token } = resLocals;

  return PageLayout({
    resLocals,
    pageTitle: 'Edit Failure',
    navContext: {
      type: 'plain',
      page: 'error',
    },
    headContent: compiledScriptTag('editErrorClient.ts'),
    content: html`
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
        <div
          class="card-header ${hadJsonErrors
            ? 'bg-warning'
            : 'bg-danger text-white'} d-flex align-items-center"
        >
          <h1>${hadJsonErrors ? 'Edit warning' : 'Edit failure'}</h1>
          <button
            type="button"
            class="btn btn-light btn-sm ms-auto"
            data-bs-toggle="collapse"
            data-bs-target="#job-sequence-results"
            id="job-sequence-results-button"
          >
            Show detail
          </button>
        </div>
        <div class="card-body">
          ${hadJsonErrors
            ? html`
                <p>
                  Your changes were
                  saved${config.fileEditorUseGit
                    ? ' and pushed to the remote GitHub repository'
                    : ''},
                  but some course content contains errors that prevented it from syncing correctly.
                  This may be caused by your edit or by pre-existing issues in other files.
                </p>
              `
            : failedSync
              ? html`
                  <p>The file edit did not complete successfully.</p>
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
              : html`
                  <p>The file edit did not complete successfully.</p>
                  <p>Please go back and try again.</p>
                `}
        </div>
      </div>

      <div class="collapse" id="job-sequence-results">
        ${JobSequenceResults({ course, jobSequence })}
      </div>
    `,
  });
}
