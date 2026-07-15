import { html } from '@prairielearn/html';

import { JobSequenceResultsHtml } from '../../components/JobSequenceResults.html.js';
import { PageLayout } from '../../components/PageLayout.js';
import { config } from '../../lib/config.js';
import type { EditOutcome } from '../../lib/editors.js';
import type { ResLocalsForPage } from '../../lib/res-locals.js';
import type { JobSequenceWithTokens } from '../../lib/server-jobs.types.js';

export function EditError({
  resLocals,
  jobSequence,
  outcome,
}: {
  resLocals: ResLocalsForPage<'course' | 'course-instance'>;
  jobSequence: JobSequenceWithTokens;
  outcome: EditOutcome;
}) {
  const { course, __csrf_token } = resLocals;
  const isWarning = outcome === 'sync_json_errors';

  return PageLayout({
    resLocals,
    pageTitle: 'Edit Failure',
    navContext: {
      type: 'plain',
      page: 'error',
    },
    headContent: html`
      <script type="module">
        // This script has type="module" so it's deferred until after the DOM is loaded.
        const button = document.getElementById('job-sequence-results-button');
        const results = document.getElementById('job-sequence-results');
        results.addEventListener('show.bs.collapse', () => {
          button.textContent = 'Hide detail';
        });
        results.addEventListener('hide.bs.collapse', () => {
          button.textContent = 'Show detail';
        });
      </script>
    `,
    content: html`
      <div class="card mb-4">
        <div
          class="card-header ${isWarning
            ? 'bg-warning'
            : 'bg-danger text-white'} d-flex align-items-center"
        >
          <h1>${isWarning ? 'Edit warning' : 'Edit failure'}</h1>
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
          ${outcome === 'sync_json_errors'
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
            : html`
                <p>The file edit did not complete successfully.</p>
                ${outcome === 'sync_failed'
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
              `}
        </div>
      </div>

      <div class="collapse" id="job-sequence-results">
        ${JobSequenceResultsHtml({ course, jobSequence })}
      </div>
    `,
  });
}
