import { z } from 'zod';

import { html, escapeHtml } from '@prairielearn/html';

import { HeadContents } from '../../components/HeadContents.html.js';
import { Modal } from '../../components/Modal.html.js';
import { Navbar } from '../../components/Navbar.html.js';
import { AssessmentSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.html.js';
import { nodeModulesAssetPath } from '../../lib/assets.js';
import { type GroupConfig, IdSchema, UserSchema } from '../../lib/db-types.js';

export const GroupUsersRowSchema = z.object({
  group_id: IdSchema,
  name: z.string(),
  size: z.number(),
  users: z.array(UserSchema.pick({ user_id: true, uid: true })),
});
type GroupUsersRow = z.infer<typeof GroupUsersRowSchema>;

export function InstructorAssessmentGroups({
  groupsCsvFilename,
  groupConfigInfo,
  groups,
  notAssigned,
  resLocals,
}: {
  groupsCsvFilename?: string;
  groupConfigInfo?: GroupConfig;
  groups?: GroupUsersRow[];
  notAssigned?: string[];
  resLocals: Record<string, any>;
}) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${HeadContents({ resLocals })}
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
        ${Navbar({ resLocals })}
        <main id="content" class="container-fluid">
          ${AssessmentSyncErrorsAndWarnings({
            authz_data: resLocals.authz_data,
            assessment: resLocals.assessment,
            courseInstance: resLocals.course_instance,
            course: resLocals.course,
            urlPrefix: resLocals.urlPrefix,
          })}
          ${!groupConfigInfo
            ? html`
                <div class="card mb-4">
                  <div class="card-header bg-primary text-white d-flex align-items-center">
                    <h1>${resLocals.assessment_set.name} ${resLocals.assessment.number}: Groups</h1>
                  </div>
                  <div class="card-body">
                    This is not a group assessment. To enable this functionality, please set
                    <code>"groupWork": true</code> in <code>infoAssessment.json</code>.
                  </div>
                </div>
              `
            : html`
                ${resLocals.authz_data.has_course_instance_permission_edit
                  ? html`
                      ${UploadAssessmentGroupsModal({ csrfToken: resLocals.__csrf_token })}
                      ${AutoAssessmentGroupsModal({
                        groupMin: groupConfigInfo.minimum ? groupConfigInfo.minimum : 2,
                        groupMax: groupConfigInfo.maximum ? groupConfigInfo.maximum : 5,
                        csrfToken: resLocals.__csrf_token,
                      })}
                      ${AddGroupModal({ csrfToken: resLocals.__csrf_token })}
                      ${DeleteAllGroupsModal({
                        assessmentSetName: resLocals.assessment_set.name,
                        assessmentNumber: resLocals.assessment.number,
                        csrfToken: resLocals.__csrf_token,
                      })}
                    `
                  : ''}
                <div class="card mb-4">
                  <div class="card-header bg-primary text-white d-flex align-items-center">
                    <h1>${resLocals.assessment_set.name} ${resLocals.assessment.number}: Groups</h1>
                    ${resLocals.authz_data.has_course_instance_permission_edit
                      ? html`
                          <div class="ml-auto">
                            <button
                              type="button"
                              class="btn btn-sm btn-light"
                              data-toggle="modal"
                              data-target="#addGroupModal"
                            >
                              <i class="fa fa-plus" aria-hidden="true"></i> Add a group
                            </button>
                            <button
                              type="button"
                              class="btn btn-sm btn-danger"
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
                    <table
                      id="usersTable"
                      class="table table-sm table-hover tablesorter"
                      aria-label="Groups"
                    >
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
                        ${groups?.map(function (row) {
                          return html` <tr data-test-group-id="${row.group_id}">
                            <td>${row.name}</td>
                            <td class="text-center">${row.size}</td>
                            <td class="text-center">
                              <small>
                                ${row.users?.length > 0
                                  ? row.users.map((user) => user.uid).join(', ')
                                  : '(empty)'}
                              </small>
                            </td>
                            ${resLocals.authz_data.has_course_instance_permission_edit
                              ? html`
                                  <td class="text-center">
                                    <div class="dropdown js-group-action-dropdown">
                                      <button
                                        type="button"
                                        class="btn btn-xs btn-ghost dropdown-toggle"
                                        data-toggle="dropdown"
                                        data-boundary="window"
                                        aria-haspopup="true"
                                        aria-expanded="false"
                                      >
                                        Action <span class="caret"></span>
                                      </button>
                                      <div class="dropdown-menu">
                                        <button
                                          class="dropdown-item js-group-action"
                                          data-toggle="popover"
                                          data-container="body"
                                          data-html="true"
                                          data-placement="auto"
                                          title="Add members"
                                          data-content="${escapeHtml(
                                            AddMembersForm({
                                              row,
                                              csrfToken: resLocals.__csrf_token,
                                            }),
                                          )}"
                                        >
                                          <i class="fa fa-user-plus" aria-hidden="true"></i> Add
                                          members
                                        </button>
                                        <button
                                          class="dropdown-item js-group-action"
                                          ${row.users.length === 0
                                            ? 'disabled'
                                            : html`
                                                data-toggle="popover" data-container="body"
                                                data-html="true" data-placement="auto" title="Remove
                                                members"
                                                data-content="${escapeHtml(
                                                  RemoveMembersForm({
                                                    row,
                                                    csrfToken: resLocals.__csrf_token,
                                                  }),
                                                )}"
                                              `}
                                        >
                                          <i class="fa fa-user-minus" aria-hidden="true"></i> Remove
                                          members
                                        </button>
                                        <button
                                          class="dropdown-item js-group-action"
                                          data-toggle="popover"
                                          data-container="body"
                                          data-html="true"
                                          data-placement="auto"
                                          title="Delete group"
                                          data-content="${escapeHtml(
                                            DeleteGroupForm({
                                              row,
                                              csrfToken: resLocals.__csrf_token,
                                            }),
                                          )}"
                                        >
                                          <i class="fa fa-times" aria-hidden="true"></i> Delete
                                          group
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
                          href="${resLocals.urlPrefix}/assessment/${resLocals.assessment
                            .id}/downloads/${groupsCsvFilename}"
                        >
                          ${groupsCsvFilename}
                        </a>
                      </p>
                      <small>
                        ${notAssigned?.length === 0
                          ? html` <strong> All students have been assigned groups. </strong> `
                          : html`
                              <strong>
                                ${notAssigned?.length
                                  ? html` 
                              ${notAssigned?.length}
                              student${notAssigned?.length > 1 ? html`s` : ''} not yet
                              assigned:
                            </strong>
                            `
                                  : ''}
                                <ul class="mb-0">
                                  ${notAssigned?.map(function (uid) {
                                    return html` <li>${uid}</li> `;
                                  })}
                                </ul>
                              </strong>
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
              `}
        </main>
      </body>
    </html>
  `.toString();
}

function AddMembersForm({ row, csrfToken }: { row: GroupUsersRow; csrfToken: string }) {
  return html`
    <form name="add-member-form" method="POST">
      <div class="form-group">
        <label for="add_member_uids">UIDs</label>
        <input
          type="text"
          class="form-control"
          placeholder="student@example.com"
          name="add_member_uids"
          aria-describedby="add_member_uids_help"
        />
        <small id="add_member_uids_help" class="form-text text-muted">
          Separate multiple UIDs with commas.
        </small>
      </div>
      <input type="hidden" name="__action" value="add_member" />
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <input type="hidden" name="group_id" value="${row.group_id}" />
      <button type="button" class="btn btn-secondary" data-dismiss="popover">Cancel</button>
      <button type="submit" class="btn btn-primary">Add</button>
    </form>
  `;
}

function DeleteGroupForm({ row, csrfToken }: { row: GroupUsersRow; csrfToken: string }) {
  return html`
    <form name="delete-group-form" method="POST">
      <p>Are you sure you want to delete the group <strong>${row.name}</strong>?</p>
      <input type="hidden" name="__action" value="delete_group" />
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <input type="hidden" name="group_id" value="${row.group_id}" />
      <button type="button" class="btn btn-secondary" data-dismiss="popover">Cancel</button>
      <button type="submit" class="btn btn-danger">Delete</button>
    </form>
  `;
}

function RemoveMembersForm({ row, csrfToken }: { row: GroupUsersRow; csrfToken: string }) {
  return html`
    <form name="delete-member-form" method="POST">
      <div class="form-group">
        <label for="delete-member-form-${row.group_id}">UID:</label>
        <select class="custom-select" name="user_id" id="delete-member-form-${row.group_id}">
          ${row.users.map((user) => {
            return html` <option value="${user.user_id}">${user.uid}</option> `;
          })}
        </select>
      </div>
      <input type="hidden" name="__action" value="delete_member" />
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <input type="hidden" name="group_id" value="${row.group_id}" />
      <button type="button" class="btn btn-secondary" data-dismiss="popover">Cancel</button>
      <button type="submit" class="btn btn-danger" ${row.users.length > 0 ? '' : 'disabled'}>
        Delete
      </button>
    </form>
  `;
}

function UploadAssessmentGroupsModal({ csrfToken }: { csrfToken: string }) {
  return Modal({
    id: 'uploadAssessmentGroupsModal',
    title: 'Upload new group assignments',
    formEncType: 'multipart/form-data',
    body: html`
      <p>Upload a CSV file in the format of:</p>
      <code class="text-dark">
        groupName,UID<br />
        groupA,one@example.com<br />
        groupA,two@example.com<br />
        groupB,three@example.com<br />
        groupB,four@example.com</code
      >
      <!-- Closing code tag not on its own line to improve copy/paste formatting -->
      <p class="mt-3">
        The <code>groupname</code> column should be a unique identifier for each group. To change
        the grouping, link uids to the groupname.
      </p>
      <div class="form-group">
        <div class="custom-file">
          <input
            type="file"
            accept=".csv"
            name="file"
            class="custom-file-input"
            id="uploadAssessmentGroupsFileInput"
          />
          <label class="custom-file-label" for="uploadAssessmentGroupsFileInput">
            Choose CSV file
          </label>
        </div>
      </div>
    `,
    footer: html`
      <input type="hidden" name="__action" value="upload_assessment_groups" />
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <button type="button" class="btn btn-secondary" data-dismiss="modal">Cancel</button>
      <button type="submit" class="btn btn-primary">Upload</button>
    `,
  });
}

function AutoAssessmentGroupsModal({
  groupMin,
  groupMax,
  csrfToken,
}: {
  groupMin: number;
  groupMax: number;
  csrfToken: string;
}) {
  return Modal({
    id: 'autoAssessmentGroupsModal',
    title: 'Auto new group setting',
    body: html`
      <div class="form-group">
        <label for="formMin">Min number of members in a group</label>
        <input
          type="text"
          value="${groupMin}"
          class="form-control"
          id="formMin"
          name="min_group_size"
        />
      </div>
      <div class="form-group">
        <label for="formMax">Max number of members in a group</label>
        <input
          type="text"
          value="${groupMax}"
          class="form-control"
          id="formMax"
          name="max_group_size"
        />
      </div>
    `,
    footer: html`
      <input type="hidden" name="__action" value="auto_assessment_groups" />
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <button type="button" class="btn btn-secondary" data-dismiss="modal">Cancel</button>
      <button type="submit" class="btn btn-primary">Group</button>
    `,
  });
}

function AddGroupModal({ csrfToken }: { csrfToken: string }) {
  return Modal({
    id: 'addGroupModal',
    title: 'Add a group',
    body: html`
      <div class="form-group">
        <label for="formName">Group Name</label>
        <input type="text" class="form-control" id="formName" name="group_name" />
      </div>
      <div class="form-group">
        <label for="addGroupUids">UIDs</label>
        <input
          type="text"
          class="form-control"
          id="addGroupUids"
          name="uids"
          placeholder="student1@example.com, student2@example.com"
          aria-describedby="addGroupUidsHelp"
        />
        <small id="addGroupUidsHelp" class="form-text text-muted">
          Separate multiple UIDs with commas.
        </small>
      </div>
    `,
    footer: html`
      <input type="hidden" name="__action" value="add_group" />
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <button type="button" class="btn btn-secondary" data-dismiss="modal">Cancel</button>
      <button type="submit" class="btn btn-primary">Add</button>
    `,
  });
}

function DeleteAllGroupsModal({
  csrfToken,
  assessmentSetName,
  assessmentNumber,
}: {
  csrfToken: string;
  assessmentSetName: string;
  assessmentNumber: number;
}) {
  return Modal({
    id: 'deleteAllGroupsModal',
    title: 'Delete all existing groups',
    body: html`
      <p>
        Are you sure you want to delete all existing groups for
        <strong>${assessmentSetName} ${assessmentNumber}</strong>? This cannot be undone.
      </p>
    `,
    footer: html`
      <input type="hidden" name="__action" value="delete_all" />
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <button type="button" class="btn btn-secondary" data-dismiss="modal">Cancel</button>
      <button type="submit" class="btn btn-danger">Delete all</button>
    `,
  });
}
