import { EncodedData } from '@prairielearn/browser-utils';
import { html, unsafeHtml } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

import type {
  JobWithFormattedOutput,
  JobSequenceWithFormattedOutput,
} from '../lib/server-jobs.types.js';

export interface JobSequenceResultsData {
  jobSequenceId: string;
  token: string;
  jobCount: number;
  jobs: Pick<JobWithFormattedOutput, 'id' | 'status' | 'token'>[];
}

// If you want live updates, you also need to import lib/jobSequenceResults.js in the page's JavaScript asset.
export function JobSequenceResults({
  jobSequence,
}: {
  jobSequence: JobSequenceWithFormattedOutput;
}) {
  return html`
    ${EncodedData<JobSequenceResultsData>(
      {
        jobSequenceId: jobSequence.id,
        token: jobSequence.token,
        jobCount: jobSequence.jobs.length,
        jobs: jobSequence.jobs.map((job) => ({
          id: job.id,
          status: job.status,
          token: job.token,
        })),
      },
      'job-sequence-results-data',
    )}

    <div class="card mb-4">
      <div class="card-header bg-primary text-white">
        ${jobSequence.description} #${jobSequence.number}
      </div>

      ${jobSequence.jobs.map(
        (job) => html`
          <div class="list-group">
            <li class="list-group-item">
              ${jobSequence.legacy
                ? html`
                    <h4 class="list-group-item-heading">
                      Stage ${job.number_in_sequence}: ${job.description}
                    </h4>
                    ${job.command
                      ? html`
                          <p class="mb-1">
                            Command
                            <code>${job.command}${job.arguments?.map((arg) => ` ${arg}`)}</code>
                            ${job.working_directory
                              ? html` run in <code>${job.working_directory}</code>`
                              : ''}
                          </p>
                        `
                      : ''}
                  `
                : ''}
              <p class="mb-1">
                Started at ${job.start_date_formatted}
                ${jobSequence.user_uid ? `by ${jobSequence.user_uid}` : ''}
                ${jobSequence.authn_user_uid !== jobSequence.user_uid
                  ? `(really ${jobSequence.authn_user_uid})`
                  : ''}
                ${job.finish_date_formatted
                  ? html`&mdash; finished at ${job.finish_date_formatted}`
                  : ''}
              </p>
              <p class="mb-1">
                ${renderEjs(import.meta.url, "<%- include('../pages/partials/jobStatus'); %>", {
                  status: job.status,
                })}
                ${job.status === 'Running' ? html`<i class="fa fa-sync fa-spin fa-fw"></i>` : ''}
              </p>
              ${jobSequence.legacy
                ? html`
                    ${job.status === 'Error' && job.exit_code != null
                      ? html`<p class="mb-1">Exit code: ${job.exit_code}</p>`
                      : ''}
                    ${job.exit_signal != null
                      ? html`<p class="mb-1">Exit signal: ${job.exit_signal}</p>`
                      : ''}
                    ${job.error_message != null
                      ? html`<p class="mb-1">Error message: ${job.error_message}</p>`
                      : ''}
                  `
                : ''}
              <pre
                id="output-${job.id}"
                class="text-white rounded p-3 mb-0 mt-3"
                style="background-color: black;"
              >
${unsafeHtml(job.output)}</pre
              >
            </li>
          </div>
        `,
      )}
    </div>
  `;
}
