import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

import { HeadContents } from '../../components/HeadContents.html.js';
import { nodeModulesAssetPath } from '../../lib/assets.js';
import type { JobSequenceWithFormattedOutput } from '../../lib/server-jobs.js';

export function JobSequence({
  resLocals,
  job_sequence,
}: {
  resLocals: Record<string, any>;
  job_sequence: JobSequenceWithFormattedOutput;
}) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${HeadContents({
          resLocals,
          pageTitle: `${job_sequence.description} #${job_sequence.number}`,
        })}
        <script src="${nodeModulesAssetPath('socket.io-client/dist/socket.io.min.js')}"></script>
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
          ${renderEjs(import.meta.url, "<%- include('../partials/jobSequenceResults') %>", {
            ...resLocals,
            job_sequence,
            job_sequence_enable_live_update: true,
          })}
        </main>
      </body>
    </html>
  `.toString();
}
