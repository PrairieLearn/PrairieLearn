import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';
import { nodeModulesAssetPath } from '../../lib/assets';

export function AdministratorJobSequence({
  job_sequence,
  resLocals,
}: {
  job_sequence: any;
  resLocals: Record<string, any>;
}) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${renderEjs(__filename, "<%- include('../partials/head') %>", {
          ...resLocals,
          pageTitle: `${job_sequence.description} #${job_sequence.number}`,
        })}
        <script src="${nodeModulesAssetPath('socket.io-client/dist/socket.io.min.js')}"></script>
      </head>
      <body>
        ${renderEjs(__filename, "<%- include('../partials/navbar') %>", {
          ...resLocals,
          navPage: '',
        })}
        <main id="content" class="container-fluid">
          <div class="row">
            <div class="col-12">
              <a class="btn btn-primary mb-4" href="javascript:history.back();" role="button">
                <i class="fa fa-arrow-left" aria-hidden="true"></i>
                Back to previous page
              </a>
            </div>
          </div>
          ${renderEjs(__filename, "<%- include('../partials/jobSequenceResults') %>", {
            ...resLocals,
            job_sequence,
            job_sequence_enable_live_update: true,
          })}
        </main>
      </body>
    </html>
  `.toString();
}
