const { html } = require('@prairielearn/html');
const { renderEjs } = require('@prairielearn/html-ejs');

function AdministratorSettings({ resLocals }) {
  return html`
    <!DOCTYPE html>
    <html>
      <head>
        ${renderEjs(__filename, "<%- include('../partials/head'); %>", resLocals)}
      </head>
      <body>
        <script>
          $(function () {
            $('[data-toggle="popover"]').popover({ sanitize: false });
          });
        </script>
        ${renderEjs(__filename, "<%- include('../partials/navbar'); %>", {
          ...resLocals,
          navPage: 'admin',
          navSubPage: 'settings',
        })}
        <div id="content" class="container-fluid">
          <!-- Chunk generation -->
          <div class="card mb-4">
            <div class="card-header bg-primary text-white d-flex align-items-center">
              Chunk generation
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
            <div class="card-header bg-primary text-white">Actions</div>
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
        </div>
      </body>
    </html>
  `.toString();
}

module.exports.AdministratorSettings = AdministratorSettings;
