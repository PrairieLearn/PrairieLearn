import { html } from '@prairielearn/html';

import { type User } from '../../../../../../../../../lib/db-types.js';
import { type CourseUsersRow } from '../utils/index.ts';
export function StaffTable({
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
        <th>UID</th>
        <th>Name</th>
        <th>Course content access</th>
        <th>Student data access</th>
        <th>Actions</th>
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
                            data-toggle="dropdown"
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
                                data-toggle="dropdown"
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
                            data-toggle="dropdown"
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
