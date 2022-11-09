const { html } = require('@prairielearn/html');
const { renderEjs } = require('@prairielearn/html-ejs');


const InstructorSharing =  ({
  sharing_name,
  sharing_id,
  sharing_sets,
  resLocals,
}) => {
  return html`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        ${renderEjs(__filename, "<%- include('../../pages/partials/head') %>", resLocals)}
        <style>
          .continue-card-container {
            width: 100%;
            max-width: 400px;
          }
        </style>
      </head>
      <body>
        <script>
            $(function() {
                $('[data-toggle="popover"]').popover({
                  sanitize: false
                })
            });
        </script>
        ${renderEjs(__filename, "<%- include('../partials/navbar'); %>", resLocals)}
        <div id="content" class="container-fluid">
          <div class="card mb-4">
            <div class="card-header bg-primary text-white d-flex">
                Course Sharing Info
            </div>
            <table class="table table-sm table-hover two-column-description">
              <tbody>
                <tr><th>Sharing Name</th><td>@${sharing_name}</td></tr>
                <tr><th>Sharing ID</th><td><${sharing_id}></td></tr>
              </tbody>
            </table>
          </div>

          <div class="card mb-4">
          <div class="card-header bg-primary">
            <div class="row align-items-center justify-content-between">
              <div class="col-auto">
                <span class="text-white">Sharing Sets</span>
              </div>
              <div class="col-auto">
                <button type="button" class="btn btn-light btn-sm ml-auto" id="courseSharingSetAddButton" tabindex="0"
                  data-toggle="popover" data-container="body" data-html="true" data-placement="auto" title="Create Sharing Set"
                  data-content="<%= include('coursePermissionsInsertForm', {id: 'coursePermissionsInsertButton'}) %>"
                  data-trigger="manual" onclick="$(this).popover('show')"
                >
                  <i class="fas fa-plus" aria-hidden="true"></i>
                  <span class="d-none d-sm-inline">Create Sharing Set</span>
                </button>
              </div>
            </div>
          </div>
          <table class="table table-sm table-hover table-striped">
            <thead>
              <th>Sharing Set Name</th>
              <th>Shared With</th>
            </thead>
            <tbody>
              ${sharing_sets.map(sharing_set => html`
                <tr><td>${sharing_set.name}</td>
                <td class="middle-align">${sharing_set.shared_with.map(course_shared_with => html`
                  <form name="student-data-access-change-<%= course_user.user_id %>-<%= cir.id %>" method="POST" class="d-inline">
                    <input type="hidden" name="__action" value="course_instance_permissions_update_role_or_delete">
                    <input type="hidden" name="__csrf_token" value="<%= __csrf_token %>">
                    <input type="hidden" name="user_id" value="<%= course_user.user_id %>">
                    <input type="hidden" name="course_instance_id" value="<%= cir.id %>">
                    <div class="btn-group btn-group-sm" role="group" aria-label="Button group with nested dropdown">
                      <!-- TODO we don't actually want the main part to be a button! -->
                      <div class="btn-group btn-group-sm" role="group">
                        <div class="btn btn-sm btn-outline-primary">
                          ${course_shared_with.short_name}
                        </div>
                      </div>
                      <button type="submit" class="btn btn-sm btn-outline-primary">
                        <i class="fa fa-times"></i>
                      </button>
                    </div>
                  </form>
                `)}
                  <form name="student-data-access-add-<%= course_user.user_id %>" method="POST" class="d-inline">
                    <input type="hidden" name="__action" value="course_instance_permissions_insert">
                    <input type="hidden" name="__csrf_token" value="<%= __csrf_token %>">
                    <input type="hidden" name="user_id" value="<%= course_user.user_id %>">
                    <div class="btn-group btn-group-sm" role="group">
                        <button id="addCIPDrop-<%= course_user.user_id %>" type="button" class="btn btn-sm btn-outline-dark dropdown-toggle" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
                          Add...
                        </button>
                        <div class="" aria-labelledby="addCIPDrop-<%= course_user.user_id %>">

                        </div>
                    </div>
                  </form>
                </td></tr>
              `)}
            </tbody>
        </div>
      </body>
    </html>
  `.toString();

}

module.exports.InstructorSharing = InstructorSharing;
