import { z } from 'zod';

import { escapeHtml, html } from '@prairielearn/html';
import { IdSchema } from '@prairielearn/zod';

import { Modal } from '../../components/Modal.js';
import { PageLayout } from '../../components/PageLayout.js';
import { nodeModulesAssetPath } from '../../lib/assets.js';
import { type TeamConfig, UserSchema } from '../../lib/db-types.js';
import type { UntypedResLocals } from '../../lib/res-locals.types.js';

export const TeamUsersRowSchema = z.object({
  team_id: IdSchema,
  name: z.string(),
  size: z.number(),
  users: z.array(UserSchema.pick({ id: true, uid: true })),
});
type TeamUsersRow = z.infer<typeof TeamUsersRowSchema>;

export function InstructorAssessmentTeams({
  teamsCsvFilename,
  teamConfigInfo,
  teams,
  notAssigned,
  resLocals,
}: {
  teamsCsvFilename?: string;
  teamConfigInfo?: TeamConfig;
  teams?: TeamUsersRow[];
  notAssigned?: string[];
  resLocals: UntypedResLocals;
}) {
  return PageLayout({
    resLocals,
    pageTitle: 'Groups',
    navContext: {
      type: 'instructor',
      page: 'assessment',
      subPage: 'teams',
    },
    options: {
      fullWidth: true,
    },
    headContent: html`
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
    `,
    content: html`
      ${!teamConfigInfo
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
                  ${UploadAssessmentTeamsModal({ csrfToken: resLocals.__csrf_token })}
                  ${RandomAssessmentTeamsModal({
                    groupMin: teamConfigInfo.minimum ?? 2,
                    groupMax: teamConfigInfo.maximum ?? 5,
                    csrfToken: resLocals.__csrf_token,
                  })}
                  ${AddTeamModal({ csrfToken: resLocals.__csrf_token })}
                  ${DeleteAllTeamsModal({
                    assessmentSetName: resLocals.assessment_set.name,
                    assessmentNumber: resLocals.assessment.number,
                    csrfToken: resLocals.__csrf_token,
                  })}
                `
              : ''}
            <div class="card mb-4">
              <div class="card-header bg-primary text-white d-flex align-items-center gap-2">
                <h1>${resLocals.assessment_set.name} ${resLocals.assessment.number}: Groups</h1>
                ${resLocals.authz_data.has_course_instance_permission_edit
                  ? html`
                      <div class="ms-auto">
                        <button
                          type="button"
                          class="btn btn-sm btn-light"
                          data-bs-toggle="modal"
                          data-bs-target="#addTeamModal"
                        >
                          <i class="fa fa-plus" aria-hidden="true"></i> Add a group
                        </button>
                        <button
                          type="button"
                          class="btn btn-sm btn-danger"
                          data-bs-toggle="modal"
                          data-bs-target="#deleteAllTeamsModal"
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
                            data-bs-toggle="modal"
                            data-bs-target="#uploadAssessmentTeamsModal"
                          >
                            <i class="fas fa-upload" aria-hidden="true"></i> Upload
                          </button>
                          <div class="mt-2">Upload a CSV file with group assignments.</div>
                        </div>
                        <div class="col-sm bg-light py-4 border" align="center">
                          <button
                            type="button"
                            class="btn btn-primary text-nowrap"
                            data-bs-toggle="modal"
                            data-bs-target="#randomAssessmentTeamsModal"
                          >
                            <i class="fas fa-shuffle" aria-hidden="true"></i> Random
                          </button>
                          <div class="mt-2">Randomly assign students to groups.</div>
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
                    ${teams?.map(function (row) {
                      return html` <tr data-test-team-id="${row.team_id}">
                        <td>${row.name}</td>
                        <td class="text-center">${row.size}</td>
                        <td class="text-center">
                          <small>
                            ${row.users.length > 0
                              ? row.users.map((user) => user.uid).join(', ')
                              : '(empty)'}
                          </small>
                        </td>
                        ${resLocals.authz_data.has_course_instance_permission_edit
                          ? html`
                              <td class="text-center">
                                <div class="dropdown js-team-action-dropdown">
                                  <button
                                    type="button"
                                    class="btn btn-xs btn-ghost dropdown-toggle"
                                    data-bs-toggle="dropdown"
                                    data-bs-boundary="window"
                                    aria-haspopup="true"
                                    aria-expanded="false"
                                  >
                                    Action <span class="caret"></span>
                                  </button>
                                  <div class="dropdown-menu">
                                    <button
                                      class="dropdown-item js-team-action"
                                      data-bs-toggle="popover"
                                      data-bs-container="body"
                                      data-bs-html="true"
                                      data-bs-placement="auto"
                                      data-bs-title="Add members"
                                      data-bs-content="${escapeHtml(
                                        AddMembersForm({
                                          row,
                                          csrfToken: resLocals.__csrf_token,
                                        }),
                                      )}"
                                    >
                                      <i class="fa fa-user-plus" aria-hidden="true"></i> Add members
                                    </button>
                                    ${row.users.length > 0
                                      ? html`
                                          <button
                                            class="dropdown-item js-team-action"
                                            data-bs-toggle="popover"
                                            data-bs-container="body"
                                            data-bs-html="true"
                                            data-bs-placement="auto"
                                            data-bs-title="Remove members"
                                            data-bs-content="${escapeHtml(
                                              RemoveMembersForm({
                                                row,
                                                csrfToken: resLocals.__csrf_token,
                                              }),
                                            )}"
                                          >
                                            <i class="fa fa-user-minus" aria-hidden="true"></i>
                                            Remove members
                                          </button>
                                        `
                                      : html`
                                          <button class="dropdown-item js-team-action" disabled>
                                            <i class="fa fa-user-minus" aria-hidden="true"></i>
                                            Remove members
                                          </button>
                                        `}
                                    <button
                                      class="dropdown-item js-team-action"
                                      data-bs-toggle="popover"
                                      data-bs-container="body"
                                      data-bs-html="true"
                                      data-bs-placement="auto"
                                      data-bs-title="Delete group"
                                      data-bs-content="${escapeHtml(
                                        DeleteTeamForm({
                                          row,
                                          csrfToken: resLocals.__csrf_token,
                                        }),
                                      )}"
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
                      href="${resLocals.urlPrefix}/assessment/${resLocals.assessment
                        .id}/downloads/${teamsCsvFilename}"
                    >
                      ${teamsCsvFilename}
                    </a>
                  </p>
                  <small>
                    ${notAssigned?.length === 0
                      ? html` <strong> All students have been assigned groups. </strong> `
                      : html`
                          <strong>
                            ${notAssigned?.length
                              ? html`
                        ${notAssigned.length}
                        student${notAssigned.length > 1 ? html`s` : ''} not yet
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
    `,
  });
}

function AddMembersForm({ row, csrfToken }: { row: TeamUsersRow; csrfToken: string }) {
  return html`
    <form name="add-member-form" method="POST">
      <div class="mb-3">
        <label class="form-label" for="add_member_uids">UIDs</label>
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
      <input type="hidden" name="team_id" value="${row.team_id}" />
      <button type="button" class="btn btn-secondary" data-bs-dismiss="popover">Cancel</button>
      <button type="submit" class="btn btn-primary">Add</button>
    </form>
  `;
}

function DeleteTeamForm({ row, csrfToken }: { row: TeamUsersRow; csrfToken: string }) {
  return html`
    <form name="delete-team-form" method="POST">
      <p>Are you sure you want to delete the group <strong>${row.name}</strong>?</p>
      <input type="hidden" name="__action" value="delete_team" />
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <input type="hidden" name="team_id" value="${row.team_id}" />
      <button type="button" class="btn btn-secondary" data-bs-dismiss="popover">Cancel</button>
      <button type="submit" class="btn btn-danger">Delete</button>
    </form>
  `;
}

function RemoveMembersForm({ row, csrfToken }: { row: TeamUsersRow; csrfToken: string }) {
  return html`
    <form name="delete-member-form" method="POST">
      <div class="mb-3">
        <label class="form-label" for="delete-member-form-${row.team_id}">UID:</label>
        <select class="form-select" name="user_id" id="delete-member-form-${row.team_id}">
          ${row.users.map((user) => {
            return html` <option value="${user.id}">${user.uid}</option> `;
          })}
        </select>
      </div>
      <input type="hidden" name="__action" value="delete_member" />
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <input type="hidden" name="team_id" value="${row.team_id}" />
      <button type="button" class="btn btn-secondary" data-bs-dismiss="popover">Cancel</button>
      <button type="submit" class="btn btn-danger" ${row.users.length > 0 ? '' : 'disabled'}>
        Delete
      </button>
    </form>
  `;
}

function UploadAssessmentTeamsModal({ csrfToken }: { csrfToken: string }) {
  return Modal({
    id: 'uploadAssessmentTeamsModal',
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
      <div class="mb-3">
        <label class="form-label" for="uploadAssessmentTeamsFileInput"> Choose CSV file </label>
        <input
          type="file"
          accept=".csv"
          name="file"
          class="form-control"
          id="uploadAssessmentTeamsFileInput"
        />
      </div>
    `,
    footer: html`
      <input type="hidden" name="__action" value="upload_assessment_teams" />
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
      <button type="submit" class="btn btn-primary">Upload</button>
    `,
  });
}

function RandomAssessmentTeamsModal({
  groupMin,
  groupMax,
  csrfToken,
}: {
  groupMin: number;
  groupMax: number;
  csrfToken: string;
}) {
  return Modal({
    id: 'randomAssessmentTeamsModal',
    title: 'Random group assignments',
    body: html`
      <div class="mb-3">
        <label class="form-label" for="formMin">Min number of members in a group</label>
        <input
          type="number"
          required
          min="1"
          value="${groupMin}"
          class="form-control"
          id="formMin"
          name="min_team_size"
        />
      </div>
      <div class="mb-3">
        <label class="form-label" for="formMax">Max number of members in a group</label>
        <input
          type="number"
          required
          min="1"
          value="${groupMax}"
          class="form-control"
          id="formMax"
          name="max_team_size"
        />
      </div>
    `,
    footer: html`
      <input type="hidden" name="__action" value="random_assessment_teams" />
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
      <button type="submit" class="btn btn-primary">Group</button>
    `,
  });
}

function AddTeamModal({ csrfToken }: { csrfToken: string }) {
  return Modal({
    id: 'addTeamModal',
    title: 'Add a group',
    body: html`
      <div class="mb-3">
        <label class="form-label" for="formName">Group Name</label>
        <input
          type="text"
          class="form-control"
          id="formName"
          name="team_name"
          aria-describedby="addTeamNameHelp"
          maxlength="30"
          pattern="[0-9a-zA-Z]+"
        />
        <small id="addTeamNameHelp" class="form-text text-muted">
          Keep blank to use a default name. If provided, the name must be at most 30 characters long
          and may only contain letters and numbers.
        </small>
      </div>
      <div class="mb-3">
        <label class="form-label" for="addGroupUids">UIDs</label>
        <input
          type="text"
          class="form-control"
          id="addGroupUids"
          name="uids"
          placeholder="student1@example.com, student2@example.com"
          aria-describedby="addGroupUidsHelp"
          required
        />
        <small id="addGroupUidsHelp" class="form-text text-muted">
          Separate multiple UIDs with commas.
        </small>
      </div>
    `,
    footer: html`
      <input type="hidden" name="__action" value="add_team" />
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
      <button type="submit" class="btn btn-primary">Add</button>
    `,
  });
}

function DeleteAllTeamsModal({
  csrfToken,
  assessmentSetName,
  assessmentNumber,
}: {
  csrfToken: string;
  assessmentSetName: string;
  assessmentNumber: number;
}) {
  return Modal({
    id: 'deleteAllTeamsModal',
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
      <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
      <button type="submit" class="btn btn-danger">Delete all</button>
    `,
  });
}
