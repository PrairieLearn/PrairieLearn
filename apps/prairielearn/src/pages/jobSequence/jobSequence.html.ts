import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

import { JobSequenceResults } from '../../components/JobSequenceResults.html.js';
import { compiledScriptTag } from '../../lib/assets.js';
import type { JobSequenceWithTokens } from '../../lib/server-jobs.types.js';

export function JobSequence({
  resLocals,
  job_sequence,
}: {
  resLocals: Record<string, any>;
  job_sequence: JobSequenceWithTokens;
}) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${renderEjs(import.meta.url, "<%- include('../partials/head'); %>", {
          ...resLocals,
          pageTitle: `${job_sequence.description} #${job_sequence.number}`,
        })}
        ${compiledScriptTag('jobSequenceClient.ts')}
      </head>
      <body>
        ${renderEjs(import.meta.url, "<%- include('../partials/navbar'); %>", {
          ...resLocals,
          navPage: '',
        })}
        <main id="content" class="container-fluid">
          <div class="row">
            <div class="col-12">
              <a class="btn btn-primary mb-4" href="javascript:history.back();">
                <i class="fa fa-arrow-left" aria-hidden="true"></i>
                Back to previous page
              </a>
            </div>
          </div>
          ${JobSequenceResults({ course: resLocals.course, jobSequence: job_sequence })}
        </main>
      </body>
    </html>
  `.toString();
}
