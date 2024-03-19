import { z } from 'zod';
import { escapeHtml, html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

import { CourseRequestRow } from '../../lib/course-request';
import { CourseSchema, Institution, InstitutionSchema } from '../../lib/db-types';
import { config } from '../../lib/config';
import { CourseRequestsTable } from '../../components/CourseRequestsTable.html';

export const CourseWithInstitutionSchema = CourseSchema.extend({
  institution: InstitutionSchema,
});
type CourseWithInstitution = z.infer<typeof CourseWithInstitutionSchema>;

export function AdministratorCourses({
  course_requests,
  institutions,
  courses,
  coursesRoot,
  resLocals,
}: {
  course_requests: CourseRequestRow[];
  institutions: Institution[];
  courses: CourseWithInstitution[];
  coursesRoot: string;
  resLocals: Record<string, any>;
}) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${renderEjs(__filename, "<%- include('../partials/head'); %>", { ...resLocals })}
      </head>
      <body>
        <script>
          $(function () {
            $('[data-toggle="popover"]').popover({ sanitize: false });
          });
        </script>
        ${renderEjs(__filename, "<%- include('../partials/navbar') %>", {
          ...resLocals,
          navPage: 'admin',
          navSubPage: 'courses',
        })}
        <main id="content" class="container-fluid">
          ${CourseRequestsTable({
            rows: course_requests,
            institutions,
            coursesRoot,
            csrfToken: resLocals.__csrf_token,
            urlPrefix: resLocals.urlPrefix,
            showAll: false,
          })}

          <div id="courses" class="card mb-4">
            <div class="card-header bg-primary text-white d-flex align-items-center">
              Courses
              <button
                type="button"
                class="btn btn-sm btn-light ml-auto"
                id="courseInsertButton"
                data-toggle="popover"
                data-container="body"
                data-html="true"
                data-placement="auto"
                title="Add new course"
                data-content="${escapeHtml(
                  CourseInsertForm({
                    id: 'courseInsertButton',
                    institutions,
                    csrfToken: resLocals.__csrf_token,
                  }),
                )}"
              >
                <i class="fa fa-plus" aria-hidden="true"></i>
                <span class="d-none d-sm-inline">Add course</span>
              </button>
            </div>
            <div class="table-responsive">
              <table class="table table-sm table-hover table-striped">
                <thead>
                  <tr>
                    <th>Institution</th>
                    <th>Short name</th>
                    <th>Title</th>
                    <th>Timezone</th>
                    <th>Path</th>
                    <th>Repository</th>
                    <th>Branch</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${courses.map((course) => {
                    return html`
                      <tr>
                        <td>
                          <a href="/pl/institution/${course.institution.id}/admin">
                            ${course.institution.short_name}
                          </a>
                        </td>
                        ${CourseUpdateColumn({
                          course,
                          column_name: 'short_name',
                          label: 'short name',
                          href: `/pl/course/${course.id}`,
                          csrfToken: resLocals.__csrf_token,
                        })}
                        ${CourseUpdateColumn({
                          course,
                          column_name: 'title',
                          label: 'title',
                          csrfToken: resLocals.__csrf_token,
                        })}
                        ${CourseUpdateColumn({
                          course,
                          column_name: 'display_timezone',
                          label: 'timezone',
                          csrfToken: resLocals.__csrf_token,
                        })}
                        ${CourseUpdateColumn({
                          course,
                          column_name: 'path',
                          label: 'path',
                          csrfToken: resLocals.__csrf_token,
                        })}
                        ${CourseUpdateColumn({
                          course,
                          column_name: 'repository',
                          label: 'repository',
                          csrfToken: resLocals.__csrf_token,
                        })}
                        ${CourseUpdateColumn({
                          course,
                          column_name: 'branch',
                          label: 'branch',
                          csrfToken: resLocals.__csrf_token,
                        })}
                        <td class="align-middle">
                          <button
                            type="button"
                            class="btn btn-sm btn-danger text-nowrap"
                            id="courseDeleteButton${course.id}"
                            data-toggle="popover"
                            data-container="body"
                            data-html="true"
                            data-placement="auto"
                            title="Really delete ${course.short_name}?"
                            data-content="${escapeHtml(
                              CourseDeleteForm({
                                id: `courseDeleteButton${course.id}`,
                                course,
                                csrfToken: resLocals.__csrf_token,
                              }),
                            )}"
                          >
                            <i class="fa fa-times" aria-hidden="true"></i> Delete course
                          </button>
                        </td>
                      </tr>
                    `;
                  })}
                </tbody>
              </table>
            </div>
            <div class="card-footer">
              <small>
                When a course is synced, if the <strong>path</strong> does not exist on disk then a
                <code>git clone</code> is performed from the <strong>repository</strong>, otherwise
                a <code>git pull</code> is run in the <strong>path</strong> directory. The
                <strong>short name</strong> and <strong>title</strong> are updated from the JSON
                configuration file in the repository during the sync.
              </small>
            </div>
          </div>
        </main>
      </body>
    </html>
  `.toString();
}

function CourseDeleteForm({
  id,
  course,
  csrfToken,
}: {
  id: string;
  course: CourseWithInstitution;
  csrfToken: string;
}) {
  return html`
    <form name="add-user-form" method="POST">
      <input type="hidden" name="__action" value="courses_delete" />
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <input type="hidden" name="course_id" value="${course.id}" />
      <div class="form-group">
        <label for="inputConfirm${id}">Type "${course.short_name}" to confirm:</label>
        <input type="text" class="form-control" id="inputConfirm${id}" name="confirm_short_name" />
      </div>
      <div class="text-right">
        <button type="button" class="btn btn-secondary" onclick="$('#${id}').popover('hide')">
          Cancel
        </button>
        <button type="submit" class="btn btn-danger">Delete course</button>
      </div>
    </form>
  `;
}

function CourseInsertForm({
  id,
  institutions,
  csrfToken,
}: {
  id: string;
  institutions: Institution[];
  csrfToken: string;
}) {
  return html`
    <form name="add-course-form" method="POST">
      <input type="hidden" name="__action" value="courses_insert" />
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <div class="form-group">
        <label>Institution:</label>
        <select
          name="institution_id"
          class="form-control"
          onchange="this.closest('form').querySelector('[name=display_timezone]').value = this.querySelector('option:checked').dataset.timezone;"
        >
          ${institutions.map((i) => {
            return html`
              <option value="${i.id}" data-timezone="${i.display_timezone}">${i.short_name}</option>
            `;
          })}
        </select>
      </div>
      <div class="form-group">
        <label for="courseAddInputShortName">Short name:</label>
        <input
          type="text"
          class="form-control"
          id="courseAddInputShortName"
          name="short_name"
          placeholder="XC 101"
        />
      </div>
      <div class="form-group">
        <label for="courseAddInputTitle">Title:</label>
        <input
          type="text"
          class="form-control"
          id="courseAddInputTitle"
          name="title"
          placeholder="Template course title"
        />
      </div>
      <div class="form-group">
        <label for="courseAddInputTimezone">Timezone:</label>
        <input
          type="text"
          class="form-control"
          id="courseAddInputTimezone"
          name="display_timezone"
          value="${institutions[0]?.display_timezone}"
        />
      </div>
      <div class="form-group">
        <label for="courseAddInputPath">Path:</label>
        <input
          type="text"
          class="form-control"
          id="courseAddInputPath"
          name="path"
          value="/data1/courses/pl-XXX"
        />
      </div>
      <div class="form-group">
        <label for="courseAddInputRepository">Repository:</label>
        <input
          type="text"
          class="form-control"
          id="courseAddInputRepository"
          name="repository"
          value="git@github.com:PrairieLearn/pl-XXX.git"
        />
      </div>
      <div class="form-group">
        <label for="courseAddInputBranch">Branch:</label>
        <input
          type="text"
          class="form-control"
          id="courseAddInputBranch"
          name="branch"
          value="${config.courseRepoDefaultBranch}"
        />
      </div>
      <div class="text-right">
        <button type="button" class="btn btn-secondary" onclick="$('#${id}').popover('hide')">
          Cancel
        </button>
        <button type="submit" class="btn btn-primary">Add course</button>
      </div>
    </form>
  `;
}

function CourseUpdateColumn({
  course,
  column_name,
  label,
  href,
  csrfToken,
}: {
  course: CourseWithInstitution;
  column_name: keyof CourseWithInstitution;
  label: string;
  href?: string;
  csrfToken: string;
}) {
  return html`
    <td class="align-middle">
      ${typeof href !== 'undefined'
        ? html`<a href="${href}">${course[column_name]}</a>`
        : course[column_name]}
      <button
        type="button"
        class="btn btn-xs btn-secondary"
        id="courseButton${course.id}-${column_name}"
        tabindex="0"
        data-toggle="popover"
        data-container="body"
        data-html="true"
        data-placement="auto"
        title="Change ${label}"
        data-content="${escapeHtml(
          CourseUpdateColumnForm({
            id: `courseButton${course.id}-${column_name}`,
            course,
            column_name,
            csrfToken,
          }),
        )}"
      >
        <i class="fa fa-edit" aria-hidden="true"></i>
      </button>
    </td>
  `;
}

function CourseUpdateColumnForm({
  id,
  course,
  column_name,
  csrfToken,
}: {
  id: string;
  course: CourseWithInstitution;
  column_name: keyof CourseWithInstitution;
  csrfToken: string;
}) {
  return html`
    <form name="edit-course-column-form" method="POST">
      <input type="hidden" name="__action" value="courses_update_column" />
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <input type="hidden" name="course_id" value="${course.id}" />
      <input type="hidden" name="column_name" value="${column_name}" />
      <div class="form-group">
        <input
          type="text"
          class="form-control"
          id="input${id}"
          name="value"
          value="${course[column_name]}"
        />
      </div>
      <div class="text-right">
        <button type="button" class="btn btn-secondary" onclick="$('#${id}').popover('hide')">
          Cancel
        </button>
        <button type="submit" class="btn btn-primary">Change</button>
      </div>
    </form>
  `;
}
