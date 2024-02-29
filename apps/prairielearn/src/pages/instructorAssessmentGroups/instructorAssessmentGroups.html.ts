import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';
import { nodeModulesAssetPath } from '../../lib/assets';

export function InstructorAssessmentGroups({ resLocals }: { resLocals: Record<string, any> }) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${renderEjs(__filename, "<%- include('../partials/head'); %>", resLocals)}
        <link
          href="${nodeModulesAssetPath('tablesorter/dist/css/theme.bootstrap.min.css')}"
          rel="stylesheet"
        />
        <script src="${nodeModulesAssetPath(
            'tablesorter/dist/js/jquery.tablesorter.min.js',
          )}"></script>
        <script src="${nodeModulesAssetPath(
            'tablesorter/dist/js/jquery.tablesorter.widgets.min.js',
          )}"></script>
      </head>

      <body>
        <script>
          $(function () {
            $('[data-toggle="popover"]').popover({ sanitize: false });

            // Prevent the dropdown menu from closing when the popover is opened.
            $('.js-group-action[data-toggle="popover"]').on("click", (e) => {
              e.stopPropagation();
            });

            $('.js-group-action-dropdown').on('hide.bs.dropdown', (e) => {
              // If the click is inside a popover, don't hide the dropdown.
              if (e.clickEvent.target.closest('.popover')) {
                e.preventDefault();
                e.stopPropagation();
                return;
              }

              // Hide all popovers when the dropdown menu is closed.
              $('.js-group-action[data-toggle="popover"]').popover("hide");
            });
          });

          // make the file inputs display the file name
          $(document).on('change', '.custom-file-input', function () {
            let fileName = $(this).val().replace(/\\/g, '/').replace(/.*//, '');
            $(this).parent('.custom-file').find('.custom-file-label').text(fileName);
          });
        </script>
        ${renderEjs(__filename, "<%- include('../partials/navbar'); %>", resLocals)}
        <main id="content" class="container-fluid">
          ${renderEjs(
            __filename,
            "<%- include('../partials/assessmentSyncErrorsAndWarnings'); %>",
            resLocals,
          )}
          ${typeof resLocals.errormsg !== 'undefined' && resLocals.errormsg.length > 0
            ? html` <div class="alert alert-danger" role="alert">${resLocals.errormsg}</div> `
            : ''}
          ${!resLocals.isGroup
            ? html`
                <div class="card mb-4">
                  <div class="card-header bg-primary text-white d-flex align-items-center">
                    ${resLocals.assessment_set.name} ${resLocals.assessment.number}: Groups
                  </div>
                  <div class="card-body">
                    This is not a group assessment. To enable this functionality, please set
                    <code>"groupWork": true</code> in <code>infoAssessment.json</code>.
                  </div>
                </div>
              `
            : resLocals.authz_data.has_course_instance_permission_edit
              ? html`
                  <div class="container-fluid">
                    <div
                      class="modal fade"
                      id="uploadAssessmentGroupsModal"
                      tabindex="-1"
                      role="dialog"
                      aria-labelledby="uploadAssessmentGroupsModalLabel"
                    >
                      <div class="modal-dialog" role="document">
                        <div class="modal-content">
                          <div class="modal-header">
                            <h1 class="h4 modal-title" id="uploadAssessmentGroupsModalLabel">
                              Upload new group assignments
                            </h1>
                          </div>
                          <div class="modal-body">
                            <p>Upload a CSV file in the format of:</p>
                          </div>
                          <div class="modal-body">
                            <code class="mb-0 text-dark">
                              groupName,UID<br />
                              groupA,one@example.com<br />
                              groupA,two@example.com<br />
                              groupB,three@example.com<br />
                              groupB,four@example.com</code
                            >
                            <!-- Closing code tag not on its own line to improve copy/paste formatting -->
                          </div>
                          <div class="modal-body">
                            <p>
                              The <code>groupname</code> column should be a unique identifier for
                              each group. To change the grouping, link uids to the groupname.
                            </p>
                            <form
                              name="upload-assessment-group-form"
                              method="POST"
                              enctype="multipart/form-data"
                            >
                              <div class="form-group">
                                <div class="custom-file">
                                  <input
                                    type="file"
                                    accept=".csv"
                                    name="file"
                                    class="custom-file-input"
                                    id="uploadAssessmentGroupsFileInput"
                                  />
                                  <label
                                    class="custom-file-label"
                                    for="uploadAssessmentGroupsFileInput"
                                    >Choose CSV file</label
                                  >
                                </div>
                              </div>
                              <div class="d-flex justify-content-end">
                                <div class="form-group mb-0">
                                  <input
                                    type="hidden"
                                    name="__action"
                                    value="upload_assessment_groups"
                                  />
                                  <input
                                    type="hidden"
                                    name="__csrf_token"
                                    value="${resLocals.__csrf_token}"
                                  />
                                  <button
                                    type="button"
                                    class="btn btn-secondary"
                                    data-dismiss="modal"
                                  >
                                    Cancel
                                  </button>
                                  <button type="submit" class="btn btn-primary">Upload</button>
                                </div>
                              </div>
                            </form>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div class="container-fluid">
                      <div
                        class="modal fade"
                        id="autoAssessmentGroupsModal"
                        tabindex="-1"
                        role="dialog"
                        aria-labelledby="autoAssessmentGroupsModalLabel"
                      >
                        <div class="modal-dialog" role="document">
                          <div class="modal-content">
                            <div class="modal-header">
                              <h1 class="h4 modal-title" id="autoAssessmentGroupsModalLabel">
                                Auto new group setting
                              </h1>
                            </div>
                            <div class="modal-body">
                              <form
                                name="auto-assessment-group-form"
                                method="POST"
                                enctype="multipart/form-data"
                              >
                                <div class="form-group">
                                  <label for="formMin">Min number of members in a group</label>
                                  <input
                                    type="text"
                                    value="${resLocals.config_info.defaultMin}"
                                    class="form-control"
                                    id="formMin"
                                    name="min_group_size"
                                  />
                                </div>
                                <div class="form-group">
                                  <label for="formMax">Max number of members in a group</label>
                                  <input
                                    type="text"
                                    value="${resLocals.config_info.defaultMax}"
                                    class="form-control"
                                    id="formMax"
                                    name="max_group_size"
                                  />
                                </div>
                                <div class="d-flex justify-content-end">
                                  <div class="form-group mb-0">
                                    <input
                                      type="hidden"
                                      name="__action"
                                      value="auto_assessment_groups"
                                    />
                                    <input
                                      type="hidden"
                                      name="__csrf_token"
                                      value="${resLocals.__csrf_token}"
                                    />
                                    <button
                                      type="button"
                                      class="btn btn-secondary"
                                      data-dismiss="modal"
                                    >
                                      Cancel
                                    </button>
                                    <button type="submit" class="btn btn-primary">Group</button>
                                  </div>
                                </div>
                              </form>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div
                        class="modal fade"
                        id="addGroupModal"
                        tabindex="-1"
                        role="dialog"
                        aria-labelledby="addGroupModalLabel"
                      >
                        <div class="modal-dialog" role="document">
                          <div class="modal-content">
                            <div class="modal-header">
                              <h1 class="h4 modal-title" id="addGroupModalLabel">Add a group</h1>
                            </div>
                            <form name="add-group-form" method="POST">
                              <div class="modal-body">
                                <div class="form-group">
                                  <label for="formName">Group Name</label>
                                  <input
                                    type="text"
                                    class="form-control"
                                    id="formName"
                                    name="group_name"
                                  />
                                </div>
                                <br />
                                <div class="form-group">
                                  <label for="formUids">UIDs</label>
                                  <input
                                    type="text"
                                    class="form-control"
                                    id="formUids"
                                    name="uids"
                                    placeholder="one@example.com, two@example.com, three@example.com"
                                  />
                                  <small id="uidHelp" class="form-text text-muted"
                                    >Separate with "," <br />Please make sure they are not in any
                                    other groups</small
                                  >
                                </div>
                              </div>
                              <div class="modal-footer">
                                <input type="hidden" name="__action" value="add_group" />
                                <input
                                  type="hidden"
                                  name="__csrf_token"
                                  value="${resLocals.__csrf_token}"
                                />
                                <button
                                  type="button"
                                  class="btn btn-secondary"
                                  data-dismiss="modal"
                                >
                                  Cancel
                                </button>
                                <button type="submit" class="btn btn-primary">Add</button>
                              </div>
                            </form>
                          </div>
                        </div>
                      </div>
                      <div
                        class="modal fade"
                        id="deleteAllGroupsModal"
                        tabindex="-1"
                        role="dialog"
                        aria-labelledby="deleteAllGroupsModalLabel"
                      >
                        <div class="modal-dialog" role="document">
                          <div class="modal-content">
                            <div class="modal-header">
                              <h1 class="h4 modal-title" id="deleteAllGroupsModalLabel">
                                Delete all existing groups
                              </h1>
                            </div>
                            <div class="modal-body">
                              Are you sure you want to delete all existing groups for
                              <strong
                                >${resLocals.assessment_set.name}
                                ${resLocals.assessment.number}</strong
                              >? This cannot be undone.
                            </div>
                            <div class="modal-footer">
                              <form name="delete-all-form" method="POST">
                                <input type="hidden" name="__action" value="delete_all" />
                                <input
                                  type="hidden"
                                  name="__csrf_token"
                                  value="${resLocals.__csrf_token}"
                                />
                                <button
                                  type="button"
                                  class="btn btn-secondary"
                                  data-dismiss="modal"
                                >
                                  Cancel
                                </button>
                                <button type="submit" class="btn btn-danger">Delete all</button>
                              </form>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                `
              : ''}
          <div class="card mb-4">
            <div class="card-header bg-primary text-white d-flex align-items-center">
              ${resLocals.assessment_set.name} ${resLocals.assessment.number}: Groups
              ${resLocals.authz_data.has_course_instance_permission_edit
                ? html`
                    <div class="ml-auto">
                      <button
                        type="button"
                        class="btn btn-sm btn-light"
                        tabindex="0"
                        data-toggle="modal"
                        data-target="#addGroupModal"
                      >
                        <i class="fa fa-plus" aria-hidden="true"></i> Add a group
                      </button>
                      <button
                        type="button"
                        class="btn btn-sm btn-danger"
                        tabindex="0"
                        data-toggle="modal"
                        data-target="#deleteAllGroupsModal"
                      >
                        <i class="fa fa-times" aria-hidden="true"></i> Delete all groups
                      </button>
                    </div>
                  `
                : ''}
            </div>
            ${resLocals.authz_data.has_course_instance_permission_edit
              ? html`
                  <div class="container-fluid">
                    <div class="row">
                      <div class="col-sm bg-light py-4 border" align="center">
                        <button
                          type="button"
                          class="btn btn-primary text-nowrap"
                          data-toggle="modal"
                          data-target="#uploadAssessmentGroupsModal"
                        >
                          <i class="fas fa-upload" aria-hidden="true"></i> Upload
                        </button>
                        <div class="mt-2">Upload a CSV file with group assignments.</div>
                      </div>
                      <div class="col-sm bg-light py-4 border" align="center">
                        <button
                          type="button"
                          class="btn btn-primary text-nowrap"
                          data-toggle="modal"
                          data-target="#autoAssessmentGroupsModal"
                        >
                          <i class="fas fa-robot" aria-hidden="true"></i> Auto
                        </button>
                        <div class="mt-2">Automatically assign students to groups.</div>
                      </div>
                    </div>
                  </div>
                `
              : ''}
            <div class="table-responsive">
              <table id="usersTable" class="table table-sm table-hover tablesorter">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Size</th>
                    <th class="text-center">Group Members (UIDs)</th>
                    ${resLocals.authz_data.has_course_instance_permission_edit
                      ? html` <th class="sorter-false"></th> `
                      : ''}
                  </tr>
                </thead>
                <tbody>
                  ${resLocals.groups.map(function (row, iRow) {
                    return html` <tr data-test-group-id="${row.group_id}">
                      <td>${row.name}</td>
                      <td class="text-center">${row.size}</td>
                      <td class="text-center">
                        <small
                          >${row.users.length > 0
                            ? row.users.map((user) => user.uid).join(', ')
                            : '(empty)'}</small
                        >
                      </td>
                      ${resLocals.authz_data.has_course_instance_permission_edit
                        ? html`
                            <td class="text-center">
                              <div class="dropdown js-group-action-dropdown">
                                <button
                                  type="button"
                                  class="btn btn-xs dropdown-toggle"
                                  data-toggle="dropdown"
                                  aria-haspopup="true"
                                  aria-expanded="false"
                                >
                                  Action <span class="caret"></span>
                                </button>
                                <div class="dropdown-menu">
                                  <button
                                    id="row${iRow}PopoverAdd"
                                    class="dropdown-item js-group-action"
                                    data-toggle="popover"
                                    data-container="body"
                                    data-html="true"
                                    data-placement="auto"
                                    title="Add members"
                                    data-content="${resLocals.include('formAddMembers.ejs', {
                                      row: row,
                                      iRow: iRow,
                                    })}"
                                  >
                                    <i class="fa fa-user-plus" aria-hidden="true"></i> Add members
                                  </button>
                                  <button
                                    id="row${iRow}Popoverdeletemember"
                                    class="dropdown-item js-group-action"
                                    ${row.users.length === 0
                                      ? html`disabled`
                                      : html`
                                          data-toggle="popover" data-container="body"
                                          data-html="true" data-placement="auto" title="Remove
                                          members"
                                          data-content="${resLocals.include(
                                            'formRemoveMembers.ejs',
                                            { row: row, iRow: iRow },
                                          )}"
                                        `}
                                  >
                                    <i class="fa fa-user-minus" aria-hidden="true"></i> Remove
                                    members
                                  </button>
                                  <button
                                    id="row${iRow}Popoverdeletegroup"
                                    class="dropdown-item js-group-action"
                                    data-toggle="popover"
                                    data-container="body"
                                    data-html="true"
                                    data-placement="auto"
                                    title="Delete group"
                                    data-content="${resLocals.include('formDeleteGroup.ejs', {
                                      row: row,
                                      iRow: iRow,
                                    })}"
                                  >
                                    <i class="fa fa-times" aria-hidden="true"></i> Delete group
                                  </button>
                                </div>
                              </div>
                            </td>
                          `
                        : ''}
                    </tr>`;
                  })}
                </tbody>
              </table>
              <div class="card-footer">
                <p>
                  Download
                  <a
                    href="<%= urlPrefix %>/assessment/<%= assessment.id %>/downloads/<%= groupsCsvFilename %>"
                    >${resLocals.groupsCsvFilename}</a
                  >
                </p>
                <small>
                  ${resLocals.notAssigned.length == 0
                    ? html` <strong> All students have been assigned groups. </strong> `
                    : html`
                        <strong>
                          ${resLocals.notAssigned.length}
                          student${resLocals.notAssigned.length > 1 ? html`s` : ''} not yet
                          assigned:
                        </strong>
                        <ul class="mb-0">
                          ${resLocals.notAssigned.map(function (uid) {
                            return html` <li>${uid}</li> `;
                          })}
                        </ul>
                      `}
                </small>
              </div>
            </div>
            <script>
              $(function () {
                $('#usersTable').tablesorter({
                  theme: 'bootstrap',
                  widthFixed: true,
                  headerTemplate: '{content} {icon}',
                  widgets: ['uitheme'],
                  headers: {
                    3: { sorter: false },
                  },
                });
              });
            </script>
          </div>

          }
        </main>
      </body>
    </html>
  `.toString();
}
