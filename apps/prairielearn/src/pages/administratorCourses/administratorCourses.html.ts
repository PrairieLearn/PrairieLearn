import { z } from 'zod';
import { escapeHtml, html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

import { CourseRequestsTable } from '../administratorCourseRequests/administratorCourseRequests.html';
import { CourseRequestRow } from '../../lib/course-request';
import { CourseSchema, Institution, InstitutionSchema } from '../../lib/db-types';

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
                data-content="${renderEjs(__filename, "<%= include('courseInsertForm') %>", {
                  ...resLocals,
                  institutions,
                  id: 'courseInsertButton',
                })}"
                data-trigger="manual"
                onclick="$(this).popover('show')"
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
                  ${courses.map((course, i) => {
                    return html`
                      <tr>
                        <td>
                          <a href="/pl/institution/${course.institution.id}/admin">
                            ${course.institution.short_name}
                          </a>
                        </td>
                        ${renderEjs(__filename, "<%- include('courseUpdateColumn') %>", {
                          ...resLocals,
                          column_name: 'short_name',
                          label: 'short name',
                          course: course,
                          i: i,
                          href: `/pl/course/${course.id}`,
                        })}
                        ${renderEjs(__filename, "<%- include('courseUpdateColumn') %>", {
                          ...resLocals,
                          column_name: 'title',
                          label: 'title',
                          course: course,
                          i: i,
                        })}
                        ${renderEjs(__filename, "<%- include('courseUpdateColumn') %>", {
                          ...resLocals,
                          column_name: 'display_timezone',
                          label: 'timezone',
                          course: course,
                          i: i,
                        })}
                        ${renderEjs(__filename, "<%- include('courseUpdateColumn') %>", {
                          ...resLocals,
                          column_name: 'path',
                          label: 'path',
                          course: course,
                          i: i,
                        })}
                        ${renderEjs(__filename, "<%- include('courseUpdateColumn') %>", {
                          ...resLocals,
                          column_name: 'repository',
                          label: 'repository',
                          course: course,
                          i: i,
                        })}
                        ${renderEjs(__filename, "<%- include('courseUpdateColumn') %>", {
                          ...resLocals,
                          column_name: 'branch',
                          label: 'branch',
                          course: course,
                          i: i,
                        })}
                        <td class="align-middle">
                          <button
                            type="button"
                            class="btn btn-sm btn-danger"
                            id="courseDeleteButton${i}"
                            data-toggle="popover"
                            data-container="body"
                            data-html="true"
                            data-placement="auto"
                            title="Really delete ${course.short_name}?"
                            data-content="${escapeHtml(
                              renderEjs(__filename, "<%= include('courseDeleteForm') %>", {
                                ...resLocals,
                                id: 'courseDeleteButton' + i,
                                course: course,
                                i: i,
                              }),
                            )}"
                            data-trigger="manual"
                            onclick="$(this).popover('show')"
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
