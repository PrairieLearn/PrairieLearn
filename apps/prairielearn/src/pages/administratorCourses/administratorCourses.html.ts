import { type z } from 'zod';

import { escapeHtml, html } from '@prairielearn/html';

import { CourseRequestsTable } from '../../components/CourseRequestsTable.html.js';
import { PageLayout } from '../../components/PageLayout.html.js';
import { config } from '../../lib/config.js';
import { type CourseRequestRow } from '../../lib/course-request.js';
import { CourseSchema, type Institution, InstitutionSchema } from '../../lib/db-types.js';

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
  return PageLayout({
    resLocals,
    pageTitle: 'Courses',
    navContext: {
      type: 'plain',
      page: 'admin',
      subPage: 'courses',
    },
    options: {
      fullWidth: true,
    },
    content: html`
      <h1 class="visually-hidden">Courses</h1>
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
          <h2>Courses</h2>
          <button
            type="button"
            class="btn btn-sm btn-light ms-auto"
            data-bs-toggle="popover"
            data-bs-container="body"
            data-bs-html="true"
            data-bs-placement="auto"
            data-bs-title="Add new course"
            data-bs-content="${escapeHtml(
              CourseInsertForm({
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
          <table class="table table-sm table-hover table-striped" aria-label="Courses">
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
                      <a href="/pl/administrator/institution/${course.institution.id}">
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
                        data-bs-toggle="popover"
                        data-bs-container="body"
                        data-bs-html="true"
                        data-bs-placement="auto"
                        data-bs-title="Confirm deletion of ${course.short_name}"
                        data-bs-content="${escapeHtml(
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
            <code>git clone</code> is performed from the <strong>repository</strong>, otherwise a
            <code>git pull</code> is run in the <strong>path</strong> directory. The
            <strong>short name</strong> and <strong>title</strong> are updated from the JSON
            configuration file in the repository during the sync.
          </small>
        </div>
      </div>
    `,
  });
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
      <div class="mb-3">
        <label class="form-label" for="inputConfirm${id}">
          Type "${course.short_name}" to confirm:
        </label>
        <input type="text" class="form-control" id="inputConfirm${id}" name="confirm_short_name" />
      </div>
      <div class="text-end">
        <button type="button" class="btn btn-secondary" data-bs-dismiss="popover">Cancel</button>
        <button type="submit" class="btn btn-danger">Delete course</button>
      </div>
    </form>
  `;
}

function CourseInsertForm({
  institutions,
  csrfToken,
}: {
  institutions: Institution[];
  csrfToken: string;
}) {
  return html`
    <form name="add-course-form" method="POST">
      <input type="hidden" name="__action" value="courses_insert" />
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <div class="mb-3">
        <label class="form-label">Institution:</label>
        <select
          name="institution_id"
          class="form-select"
          onchange="this.closest('form').querySelector('[name=display_timezone]').value = this.querySelector('option:checked').dataset.timezone;"
        >
          ${institutions.map((i) => {
            return html`
              <option value="${i.id}" data-timezone="${i.display_timezone}">${i.short_name}</option>
            `;
          })}
        </select>
      </div>
      <div class="mb-3">
        <label class="form-label" for="courseAddInputShortName">Short name:</label>
        <input
          type="text"
          class="form-control"
          id="courseAddInputShortName"
          name="short_name"
          placeholder="XC 101"
        />
      </div>
      <div class="mb-3">
        <label class="form-label" for="courseAddInputTitle">Title:</label>
        <input
          type="text"
          class="form-control"
          id="courseAddInputTitle"
          name="title"
          placeholder="Template course title"
        />
      </div>
      <div class="mb-3">
        <label class="form-label" for="courseAddInputTimezone">Timezone:</label>
        <input
          type="text"
          class="form-control"
          id="courseAddInputTimezone"
          name="display_timezone"
          value="${institutions[0]?.display_timezone}"
        />
      </div>
      <div class="mb-3">
        <label class="form-label" for="courseAddInputPath">Path:</label>
        <input
          type="text"
          class="form-control"
          id="courseAddInputPath"
          name="path"
          value="/data1/courses/pl-XXX"
        />
      </div>
      <div class="mb-3">
        <label class="form-label" for="courseAddInputRepository">Repository:</label>
        <input
          type="text"
          class="form-control"
          id="courseAddInputRepository"
          name="repository"
          value="git@github.com:PrairieLearn/pl-XXX.git"
        />
      </div>
      <div class="mb-3">
        <label class="form-label" for="courseAddInputBranch">Branch:</label>
        <input
          type="text"
          class="form-control"
          id="courseAddInputBranch"
          name="branch"
          value="${config.courseRepoDefaultBranch}"
        />
      </div>
      <div class="text-end">
        <button type="button" class="btn btn-secondary" data-bs-dismiss="popover">Cancel</button>
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
        data-bs-toggle="popover"
        data-bs-container="body"
        data-bs-html="true"
        data-bs-placement="auto"
        data-bs-title="Change ${label}"
        data-bs-content="${escapeHtml(
          CourseUpdateColumnForm({
            course,
            column_name,
            csrfToken,
            label,
          }),
        )}"
      >
        <i class="fa fa-edit" aria-hidden="true"></i>
      </button>
    </td>
  `;
}

function CourseUpdateColumnForm({
  course,
  column_name,
  csrfToken,
  label,
}: {
  course: CourseWithInstitution;
  column_name: keyof CourseWithInstitution;
  csrfToken: string;
  label: string;
}) {
  return html`
    <form name="edit-course-column-form" method="POST">
      <input type="hidden" name="__action" value="courses_update_column" />
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <input type="hidden" name="course_id" value="${course.id}" />
      <input type="hidden" name="column_name" value="${column_name}" />
      <div class="mb-3">
        <input
          type="text"
          class="form-control"
          name="value"
          value="${course[column_name]}"
          aria-label="${label}"
        />
      </div>
      <div class="text-end">
        <button type="button" class="btn btn-secondary" data-bs-dismiss="popover">Cancel</button>
        <button type="submit" class="btn btn-primary">Change</button>
      </div>
    </form>
  `;
}
