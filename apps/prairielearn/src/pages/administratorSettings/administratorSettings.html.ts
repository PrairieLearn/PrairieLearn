import { html } from '@prairielearn/html';

import { HeadContents } from '../../components/HeadContents.html.js';
import { Navbar } from '../../components/Navbar.html.js';
import { config } from '../../lib/config.js';
import { isEnterprise } from '../../lib/license.js';

export function AdministratorSettings({ resLocals }) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${HeadContents({ resLocals, pageTitle: 'Administrator Settings' })}
      </head>
      <body>
        ${Navbar({ resLocals, navPage: 'admin', navSubPage: 'settings' })}
        <main id="content" class="container-fluid">
          <h1 class="sr-only">Administrator Settings</h1>
          <!-- Chunk generation -->
          <div class="card mb-4">
            <div class="card-header bg-primary text-white d-flex align-items-center">
              <h2>Chunk generation</h2>
            </div>
            <div class="card-body">
              <form name="generate_chunks_form" method="POST">
                <input type="hidden" name="__action" value="generate_chunks" />
                <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
                <div class="form-group">
                  <label for="generateChunksCourseIds">Course IDs:</label>
                  <input
                    type="text"
                    class="form-control"
                    id="generateChunksCourseIds"
                    name="course_ids"
                    placeholder="1,2,3"
                  />
                </div>
                <button type="submit" class="btn btn-primary">Generate</button>
              </form>
            </div>
          </div>

          <!-- Actions -->
          <div class="card mb-4">
            <div class="card-header bg-primary text-white">
              <h2>Actions</h2>
            </div>
            <div class="card-body">
              <form name="invalidate-question-cache-form" method="POST">
                <input type="hidden" name="__action" value="invalidate_question_cache" />
                <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
                <button id="invalidate-render-cache" type="button" class="btn btn-danger">
                  Invalidate question render cache
                </button>
                <div
                  id="confirm-invalidate-cache-container"
                  class="confirm-invalidate-cache"
                  style="display: none;"
                >
                  <button id="confirm-invalidate-render-cache" type="submit" class="btn btn-danger">
                    Confirm invalidate cache
                  </button>
                  <button
                    id="cancel-invalidate-render-cache"
                    type="button"
                    class="btn btn-secondary"
                  >
                    Cancel
                  </button>
                </div>
              </form>
              <script type="text/javascript">
                $(function () {
                  var invalidateButton = $('#invalidate-render-cache');
                  var confirmInvalidateContainer = $('#confirm-invalidate-cache-container');
                  var cancelInvalidateButton = $('#cancel-invalidate-render-cache');
                  invalidateButton.click(function () {
                    confirmInvalidateContainer.show();
                    invalidateButton.hide();
                  });
                  cancelInvalidateButton.click(function () {
                    invalidateButton.show();
                    confirmInvalidateContainer.hide();
                  });
                });
              </script>
            </div>
          </div>

          ${isEnterprise() && config.openAiApiKey && config.openAiOrganization
            ? html`
                <div class="card mb-4">
                  <div class="card-header bg-primary text-white">LLM Context Documents</div>
                  <div class="card-body">
                    <form class="" name="sync-context-form" method="POST">
                      <input type="hidden" name="__action" value="sync_context_documents" />
                      <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
                      <button class="btn btn-primary">Resync Documents</button>
                    </form>
                  </div>
                </div>
              `
            : ''}

          <div class="card mb-4">
            <div class="card-header bg-primary text-white">
              <h2>Bootstrap playground</h2>
            </div>
            <div class="card-body">
              <p>
                This serves as a testing ground for custom focus styles that are meant to comply
                with stricter accessibility requirements.
              </p>
              <div class="mb-4" style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                <button type="button" class="btn btn-primary">Primary</button>
                <button type="button" class="btn btn-secondary">Secondary</button>
                <button type="button" class="btn btn-success">Success</button>
                <button type="button" class="btn btn-danger">Danger</button>
                <button type="button" class="btn btn-warning">Warning</button>
                <button type="button" class="btn btn-info">Info</button>
                <button type="button" class="btn btn-light">Light</button>
                <button type="button" class="btn btn-dark">Dark</button>
                <button type="button" class="btn btn-link">Link</button>
              </div>
              <div class="mb-4" style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                <button type="button" class="btn btn-outline-primary">Primary</button>
                <button type="button" class="btn btn-outline-secondary">Secondary</button>
                <button type="button" class="btn btn-outline-success">Success</button>
                <button type="button" class="btn btn-outline-danger">Danger</button>
                <button type="button" class="btn btn-outline-warning">Warning</button>
                <button type="button" class="btn btn-outline-info">Info</button>
                <button type="button" class="btn btn-outline-dark">Dark</button>
              </div>
              <div class="p-4 bg-dark">
                <button type="button" class="btn btn-outline-light">Light</button>
              </div>
              <h3>Ghost button</h3>
              <p>
                This is a custom button style that's meant to be used when we don't want the full
                visual weight of a typical button. Useful for popover triggers.
              </p>
              <div>
                <button type="button" class="btn btn-xs btn-ghost">Extra small</button>
                <button type="button" class="btn btn-sm btn-ghost">Small</button>
                <button type="button" class="btn btn btn-ghost">Default</button>
                <button type="button" class="btn btn-lg btn-ghost">Large</button>
              </div>
            </div>
          </div>
        </main>
      </body>
    </html>
  `.toString();
}
