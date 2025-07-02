import { z } from 'zod';

import { escapeHtml, html } from '@prairielearn/html';

import { PageLayout } from '../../components/PageLayout.html.js';
import { CourseSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.html.js';
import {
  type CourseInstance,
  CourseInstancePermissionSchema,
  CourseInstanceSchema,
  CoursePermissionSchema,
  type User,
  UserSchema,
} from '../../lib/db-types.js';
import { renderHtml } from '../../lib/preact-html.js';

export const CourseUsersRowSchema = z.object({
  user: UserSchema,
  course_permission: CoursePermissionSchema,
  course_instance_roles: z
    .array(
      z.object({
        id: CourseInstanceSchema.shape.id,
        short_name: CourseInstanceSchema.shape.short_name,
        course_instance_permission_id: CourseInstancePermissionSchema.shape.id,
        course_instance_role: CourseInstancePermissionSchema.shape.course_instance_role,
        course_instance_role_formatted: z.string(),
      }),
    )
    .nullable(),
  other_course_instances: z
    .array(
      z.object({
        id: CourseInstanceSchema.shape.id,
        short_name: CourseInstanceSchema.shape.short_name,
      }),
    )
    .nullable(),
});
type CourseUsersRow = z.infer<typeof CourseUsersRowSchema>;

function hasUnknownUsers(courseUsers: CourseUsersRow[]) {
  return courseUsers.some((courseUser) => courseUser.user.name == null);
}

export function InstructorCourseAdminStaff({
  resLocals,
  courseInstances,
  courseUsers,
  uidsLimit,
  githubAccessLink,
}: {
  resLocals: Record<string, any>;
  courseInstances: CourseInstance[];
  courseUsers: CourseUsersRow[];
  uidsLimit: number;
  githubAccessLink: string | null;
}) {
  return PageLayout({
    resLocals,
    pageTitle: 'Staff',
    navContext: {
      type: 'instructor',
      page: 'course_admin',
      subPage: 'staff',
    },
    options: {
      fullWidth: true,
    },
    headContent: html`
      <style>
        .popover {
          max-width: 35%;
        }
      </style>
    `,
    content: html`
      ${renderHtml(
        <CourseSyncErrorsAndWarnings
          authz_data={resLocals.authz_data}
          course={resLocals.course}
          urlPrefix={resLocals.urlPrefix}
        />,
      )}
      <div class="card mb-4">
        <div class="card-header bg-primary text-white d-flex flex-wrap align-items-center">
          <h1 class="me-2">Staff</h1>
          <div class="ms-auto">
            <button
              type="button"
              class="btn btn-light btn-sm"
              aria-label="Remove all student data access"
              data-bs-toggle="popover"
              data-bs-container="body"
              data-bs-html="true"
              data-bs-placement="auto"
              data-bs-title="Remove all student data access"
              data-bs-content="${escapeHtml(
                CoursePermissionsRemoveStudentDataAccessForm({
                  csrfToken: resLocals.__csrf_token,
                }),
              )}"
              data-testid="remove-all-student-data-access-button"
            >
              <i class="fas fa-eye-slash" aria-hidden="true"></i>
              <span class="d-none d-sm-inline">Remove all student data access</span>
            </button>
            <button
              type="button"
              class="btn btn-light btn-sm"
              aria-label="Delete users with no access"
              data-bs-toggle="popover"
              data-bs-container="body"
              data-bs-html="true"
              data-bs-placement="auto"
              data-bs-title="Delete users with no access"
              data-bs-content="${escapeHtml(
                CoursePermissionsDeleteNoAccessForm({
                  csrfToken: resLocals.__csrf_token,
                }),
              )}"
              data-testid="delete-users-with-no-access-button"
            >
              <i class="fas fa-recycle" aria-hidden="true"></i>
              <span class="d-none d-sm-inline">Delete users with no access</span>
            </button>
            <button
              type="button"
              class="btn btn-light btn-sm"
              aria-label="Delete non-owners"
              data-bs-toggle="popover"
              data-bs-container="body"
              data-bs-html="true"
              data-bs-placement="auto"
              data-bs-title="Delete non-owners"
              data-bs-content="${escapeHtml(
                CoursePermissionsDeleteNonOwnersForm({
                  csrfToken: resLocals.__csrf_token,
                }),
              )}"
              data-testid="delete-non-owners-button"
            >
              <i class="fas fa-users-slash" aria-hidden="true"></i>
              <span class="d-none d-sm-inline">Delete non-owners</span>
            </button>
            <button
              type="button"
              class="btn btn-light btn-sm"
              aria-label="Add users"
              data-bs-toggle="popover"
              data-bs-container="body"
              data-bs-html="true"
              data-bs-placement="auto"
              data-bs-title="Add users"
              data-bs-content="${escapeHtml(
                CoursePermissionsInsertForm({
                  csrfToken: resLocals.__csrf_token,
                  uidsLimit,
                  courseInstances,
                }),
              )}"
              data-testid="add-users-button"
            >
              <i class="fas fa-users" aria-hidden="true"></i>
              <span class="d-none d-sm-inline">Add users</span>
            </button>
          </div>
        </div>
        ${StaffTable({
          csrfToken: resLocals.__csrf_token,
          courseUsers,
          authnUser: resLocals.authn_user,
          user: resLocals.user,
          isAdministrator: resLocals.is_administrator,
        })}
        <div class="card-footer small">
          ${hasUnknownUsers(courseUsers)
            ? html`
                <p class="alert alert-warning">
                  Users with name "<span class="text-danger">Unknown user</span>" either have never
                  logged in or have an incorrect UID.
                </p>
              `
            : ''}
          <details>
            <summary>Recommended access levels</summary>
            ${AccessLevelsTable()}
          </details>
          ${githubAccessLink
            ? html`
                <div class="alert alert-info mt-3">
                  The settings above do not affect access to the course's Git repository. To change
                  repository permissions, go to the
                  <a class="alert-link" href="${githubAccessLink}" target="_blank">
                    GitHub access settings page</a
                  >.
                </div>
              `
            : ''}
        </div>
      </div>
    `,
  });
}

function CoursePermissionsRemoveStudentDataAccessForm({ csrfToken }: { csrfToken: string }) {
  return html`
    <form name="remove-student-data-access" method="POST">
      <input type="hidden" name="__action" value="remove_all_student_data_access" />
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />

      <div class="mb-3">
        <p class="form-text">
          Taking this action will remove all student data access from all users (but will leave
          these users on the course staff).
        </p>
      </div>

      <div class="text-end">
        <button type="button" class="btn btn-secondary" data-bs-dismiss="popover">Cancel</button>
        <button type="submit" class="btn btn-primary">Remove all student data access</button>
      </div>
    </form>
  `;
}

function CoursePermissionsDeleteNoAccessForm({ csrfToken }: { csrfToken: string }) {
  return html`
    <form name="delete-no-access" method="POST">
      <input type="hidden" name="__action" value="delete_no_access" />
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />

      <div class="mb-3">
        <p class="form-text">
          Taking this action will remove every user from course staff who has neither course content
          access nor student data access.
        </p>
      </div>

      <div class="text-end">
        <button type="button" class="btn btn-secondary" data-bs-dismiss="popover">Cancel</button>
        <button type="submit" class="btn btn-primary">Delete users with no access</button>
      </div>
    </form>
  `;
}

function CoursePermissionsInsertForm({
  csrfToken,
  uidsLimit,
  courseInstances,
}: {
  csrfToken: string;
  uidsLimit: number;
  courseInstances: CourseInstance[];
}) {
  return html`
    <form name="add-users-form" method="POST">
      <input type="hidden" name="__action" value="course_permissions_insert_by_user_uids" />
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />

      <div class="mb-3">
        <p class="form-text">
          Use this form to add users to the course staff. Any UIDs of users who are already on the
          course staff will have their permissions updated only if the new permissions are higher
          than their existing permissions. All new users will be given the same access to course
          content and to student data.
        </p>
      </div>

      <div class="mb-3">
        <label class="form-label" for="addUsersInputUid">UIDs:</label>
        <textarea
          class="form-control"
          id="addUsersInputUid"
          name="uid"
          placeholder="staff1@example.com, staff2@example.com"
          required
          aria-describedby="addUsersInputUidHelp"
        ></textarea>
        <small id="addUsersInputUidHelp" class="form-text text-muted">
          Enter up to ${uidsLimit} UIDs separated by commas, semicolons, or whitespace.
        </small>
      </div>

      <div class="mb-3">
        <label class="form-label" for="addUsersInputCourseRole">
          Course content access for all new users:
        </label>
        <select
          class="form-select form-select-sm"
          id="addUsersInputCourseRole"
          name="course_role"
          required
        >
          <option value="None" selected>None</option>
          <option value="Previewer">Previewer</option>
          <option value="Viewer">Viewer</option>
          <option value="Editor">Editor</option>
          <option value="Owner">Owner</option>
        </select>
      </div>

      ${courseInstances?.length > 0
        ? html`
            <div class="mb-3">
              <label class="form-label" for="addUsersInputCourseInstance">
                Student data access for all new users:
              </label>
              <div class="input-group">
                <select
                  class="form-select form-select-sm"
                  id="addUsersInputCourseInstance"
                  name="course_instance_id"
                >
                  <option selected value>None</option>
                  ${courseInstances.map(
                    (ci) => html` <option value="${ci.id}">${ci.short_name}</option>`,
                  )}
                </select>
                <select
                  class="form-select form-select-sm"
                  id="addUsersInputCourseInstanceRole"
                  name="course_instance_role"
                >
                  <option value="Student Data Viewer" selected>Viewer</option>
                  <option value="Student Data Editor">Editor</option>
                </select>
              </div>
            </div>
          `
        : ''}

      <div class="text-end">
        <button type="button" class="btn btn-secondary" data-bs-dismiss="popover">Cancel</button>
        <button type="submit" class="btn btn-primary">Add users</button>
      </div>
    </form>
  `;
}

function CoursePermissionsDeleteNonOwnersForm({ csrfToken }: { csrfToken: string }) {
  return html`
    <form name="delete-non-owners" method="POST">
      <input type="hidden" name="__action" value="delete_non_owners" />
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />

      <div class="mb-3">
        <p class="form-text">
          Taking this action will remove every user from course staff who is not a course content
          Owner.
        </p>
      </div>

      <div class="text-end">
        <button type="button" class="btn btn-secondary" data-bs-dismiss="popover">Cancel</button>
        <button type="submit" class="btn btn-primary">Delete non-owners</button>
      </div>
    </form>
  `;
}

function StaffTable({
  csrfToken,
  courseUsers,
  authnUser,
  user,
  isAdministrator,
}: {
  csrfToken: string;
  courseUsers: CourseUsersRow[];
  authnUser: User;
  user: User;
  isAdministrator: boolean;
}) {
  return html`
    <table class="table table-sm table-hover table-striped" aria-label="Course staff members">
      <thead>
        <tr>
          <th>UID</th>
          <th>Name</th>
          <th>Course content access</th>
          <th>Student data access</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${courseUsers.map((courseUser) => {
          // Cannot change the course role of yourself (or of the
          // user you are emulating) unless you are an administrator.
          const canChangeCourseRole =
            (courseUser.user.user_id !== authnUser.user_id &&
              courseUser.user.user_id !== user.user_id) ||
            isAdministrator;
          return html`
            <tr>
              <td class="align-middle">${courseUser.user.uid}</td>
              <td class="align-middle">
                ${courseUser.user.name
                  ? courseUser.user.name
                  : html`<span class="text-danger">Unknown user</span>`}
              </td>
              <td class="align-middle">
                ${!canChangeCourseRole
                  ? html`
                      <button
                        id="courseContentDropdown-${courseUser.user.user_id}"
                        type="button"
                        class="btn btn-sm btn-outline-primary disabled"
                        disabled
                      >
                        ${courseUser.course_permission.course_role}
                      </button>
                    `
                  : html`
                      <form
                        name="course-content-access-form-${courseUser.user.user_id}"
                        method="POST"
                      >
                        <input
                          type="hidden"
                          name="__action"
                          value="course_permissions_update_role"
                        />
                        <input type="hidden" name="__csrf_token" value="${csrfToken}" />
                        <input type="hidden" name="user_id" value="${courseUser.user.user_id}" />
                        <div class="btn-group btn-group-sm" role="group">
                          <button
                            id="courseContentDropdown-${courseUser.user.user_id}"
                            type="button"
                            class="btn btn-sm btn-outline-primary dropdown-toggle"
                            data-bs-toggle="dropdown"
                            aria-haspopup="true"
                            aria-expanded="false"
                          >
                            ${courseUser.course_permission.course_role}
                          </button>
                          <div
                            class="dropdown-menu"
                            aria-labelledby="courseContentDropdown-${courseUser.user.user_id}"
                            style="width: 35em;"
                          >
                            <div class="dropdown-header text-wrap">
                              <p>
                                Users with course content access can see aggregate student data
                                (e.g., mean scores), but cannot see the names or scores of
                                individual students without also having student data access to a
                                particular course instance.
                              </p>
                            </div>
                            <div class="dropdown-divider"></div>
                            <button
                              class="dropdown-item mt-2"
                              type="submit"
                              name="course_role"
                              value="None"
                            >
                              <div class="text-wrap">
                                <h6>None</h6>
                                <p class="small">Cannot see any course content.</p>
                              </div>
                            </button>
                            <div class="dropdown-divider"></div>
                            <button
                              class="dropdown-item"
                              type="submit"
                              name="course_role"
                              value="Previewer"
                            >
                              <div class="text-wrap">
                                <h6>Previewer</h6>
                                <p class="small">
                                  Can see all questions, course instances, and assessments. Can see
                                  but not close issues. Cannot see any code or configuration files.
                                </p>
                              </div>
                            </button>
                            <div class="dropdown-divider"></div>
                            <button
                              class="dropdown-item"
                              type="submit"
                              name="course_role"
                              value="Viewer"
                            >
                              <div class="text-wrap">
                                <h6>Viewer</h6>
                                <p class="small">
                                  Can see all questions, course instances, and assessments. Can see
                                  but not close issues. Can see and download but not edit all code
                                  and configuration files.
                                </p>
                              </div>
                            </button>
                            <div class="dropdown-divider"></div>
                            <button
                              class="dropdown-item"
                              type="submit"
                              name="course_role"
                              value="Editor"
                            >
                              <div class="text-wrap">
                                <h6>Editor</h6>
                                <p class="small">
                                  Can see all questions, course instances, and assessments. Can see
                                  and close issues. Can see, download, and edit all code and
                                  configuration files. Can sync course files to and from the GitHub
                                  repository.
                                </p>
                              </div>
                            </button>
                            <div class="dropdown-divider"></div>
                            <button
                              class="dropdown-item"
                              type="submit"
                              name="course_role"
                              value="Owner"
                            >
                              <div class="text-wrap">
                                <h6>Owner</h6>
                                <p class="small">
                                  Can see all questions, course instances, and assessments. Can see
                                  and close issues. Can see, download, and edit all code and
                                  configuration files. Can sync course files to and from the GitHub
                                  repository. Can add and remove course staff and can change access
                                  roles.
                                </p>
                              </div>
                            </button>
                          </div>
                        </div>
                      </form>
                    `}
              </td>
              <td class="align-middle">
                ${courseUser.course_instance_roles
                  ? courseUser.course_instance_roles.map((cir) => {
                      return html`
                        <form
                          name="student-data-access-change-${courseUser.user.user_id}-${cir.id}"
                          method="POST"
                          class="d-inline"
                        >
                          <input
                            type="hidden"
                            name="__action"
                            value="course_instance_permissions_update_role_or_delete"
                          />
                          <input type="hidden" name="__csrf_token" value="${csrfToken}" />
                          <input type="hidden" name="user_id" value="${courseUser.user.user_id}" />
                          <input type="hidden" name="course_instance_id" value="${cir.id}" />
                          <div
                            class="btn-group btn-group-sm"
                            role="group"
                            aria-label="Button group with nested dropdown"
                          >
                            <div class="btn-group btn-group-sm" role="group">
                              <button
                                id="changeCIPDrop-${courseUser.user.user_id}-${cir.id}"
                                type="button"
                                class="btn btn-sm btn-outline-primary dropdown-toggle"
                                data-bs-toggle="dropdown"
                                aria-haspopup="true"
                                aria-expanded="false"
                              >
                                ${cir.short_name} (${cir.course_instance_role_formatted})
                              </button>
                              <div
                                class="dropdown-menu"
                                aria-labelledby="changeCIPDrop-${courseUser.user.user_id}-${cir.id}"
                                style="width: 35em;"
                              >
                                <div class="dropdown-header text-wrap">
                                  <p>
                                    Users with student data access can see all assessments in the
                                    course instance <code>${cir.short_name}</code>, can see all
                                    questions, and can see issues. They cannot see any code or
                                    configuration files, or close issues, without also having course
                                    content access.
                                  </p>
                                </div>
                                <div class="dropdown-divider"></div>
                                <button
                                  class="dropdown-item"
                                  type="submit"
                                  name="course_instance_role"
                                  value="Student Data Viewer"
                                >
                                  <div class="text-wrap">
                                    <h6>Viewer</h6>
                                    <p class="small">
                                      Can see but not edit scores of individual students for the
                                      course instance
                                      <code>${cir.short_name}</code>.
                                    </p>
                                  </div>
                                </button>
                                <div class="dropdown-divider"></div>
                                <button
                                  class="dropdown-item"
                                  type="submit"
                                  name="course_instance_role"
                                  value="Student Data Editor"
                                >
                                  <div class="text-wrap">
                                    <h6>Editor</h6>
                                    <p class="small">
                                      Can see and edit scores of individual students for the course
                                      instance
                                      <code>${cir.short_name}</code>.
                                    </p>
                                  </div>
                                </button>
                              </div>
                            </div>
                            <button
                              type="submit"
                              class="btn btn-sm btn-outline-primary"
                              aria-label="Remove access"
                            >
                              <i class="fa fa-times"></i>
                            </button>
                          </div>
                        </form>
                      `;
                    })
                  : ''}
                ${courseUser.other_course_instances?.length
                  ? html`
                      <form
                        name="student-data-access-add-${courseUser.user.user_id}"
                        method="POST"
                        class="d-inline"
                      >
                        <input
                          type="hidden"
                          name="__action"
                          value="course_instance_permissions_insert"
                        />
                        <input type="hidden" name="__csrf_token" value="${csrfToken}" />
                        <input type="hidden" name="user_id" value="${courseUser.user.user_id}" />
                        <div class="btn-group btn-group-sm" role="group">
                          <button
                            id="addCIPDrop-${courseUser.user.user_id}"
                            type="button"
                            class="btn btn-sm btn-outline-dark dropdown-toggle"
                            data-bs-toggle="dropdown"
                            aria-haspopup="true"
                            aria-expanded="false"
                          >
                            Add...
                          </button>
                          <div
                            class="dropdown-menu"
                            aria-labelledby="addCIPDrop-${courseUser.user.user_id}"
                          >
                            ${courseUser.other_course_instances.map((ci) => {
                              return html`
                                <button
                                  class="dropdown-item"
                                  type="submit"
                                  name="course_instance_id"
                                  value="${ci.id}"
                                >
                                  ${ci.short_name}
                                </button>
                              `;
                            })}
                          </div>
                        </div>
                      </form>
                    `
                  : ''}
              </td>
              <td class="align-middle">
                ${courseUser.course_permission.course_role !== 'Owner' || isAdministrator
                  ? html`
                      <form
                        name="student-data-access-remove-${courseUser.user.user_id}"
                        method="POST"
                      >
                        <input type="hidden" name="__action" value="course_permissions_delete" />
                        <input type="hidden" name="__csrf_token" value="${csrfToken}" />
                        <input type="hidden" name="user_id" value="${courseUser.user.user_id}" />
                        <button type="submit" class="btn btn-sm btn-outline-dark">
                          <i class="fa fa-times"></i> Delete user
                        </button>
                      </form>
                    `
                  : ''}
              </td>
            </tr>
          `;
        })}
      </tbody>
    </table>
  `;
}

function AccessLevelsTable() {
  return html`
    <table
      class="table table-striped table-sm border"
      style="max-width: 45em"
      aria-label="Recommended access levels"
    >
      <thead>
        <tr>
          <th>Role</th>
          <th class="text-center">Course content access</th>
          <th class="text-center">Student data access</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Instructor</td>
          <td class="text-center">Course content owner</td>
          <td class="text-center">Student data editor</td>
        </tr>
        <tr>
          <td>TAs developing course content</td>
          <td class="text-center">Course content editor</td>
          <td class="text-center">Student data editor</td>
        </tr>
        <tr>
          <td>Student content developers (not TAs)</td>
          <td class="text-center">Course content editor</td>
          <td class="text-center">None</td>
        </tr>
        <tr>
          <td>TAs involved in grading</td>
          <td class="text-center">None</td>
          <td class="text-center">Student data editor</td>
        </tr>
        <tr>
          <td>Other TAs</td>
          <td class="text-center">None</td>
          <td class="text-center">Student data viewer</td>
        </tr>
        <tr>
          <td>Instructors from other classes</td>
          <td class="text-center">Course content viewer</td>
          <td class="text-center">None</td>
        </tr>
      </tbody>
    </table>
  `;
}
