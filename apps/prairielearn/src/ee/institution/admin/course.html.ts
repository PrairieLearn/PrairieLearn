import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';
import { type Institution, type Course, type CourseInstance } from '../../../lib/db-types';

export function InstitutionAdminCourse({
  institution,
  course,
  courseInstances,
  resLocals,
}: {
  institution: Institution;
  course: Course;
  courseInstances: CourseInstance[];
  resLocals: Record<string, any>;
}) {
  return html`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        ${renderEjs(__filename, "<%- include('../../../pages/partials/head')%>", {
          ...resLocals,
          navPage: 'institution_admin',
          pageTitle: 'Courses',
        })}
      </head>
      <body>
        ${renderEjs(__filename, "<%- include('../../../pages/partials/navbar') %>", {
          ...resLocals,
          institution,
          navbarType: 'institution',
          navPage: 'institution_admin',
          navSubPage: 'courses',
        })}
        <nav class="container" aria-label="Breadcrumbs">
          <ol class="breadcrumb">
            <li class="breadcrumb-item">
              <a href="/pl/institution/${institution.id}/admin/courses">Courses</a>
            </li>
            <li class="breadcrumb-item active" aria-current="page">
              ${course.title} (${course.short_name})
            </li>
          </ol>
        </nav>
        <main class="container mb-4">
          <div class="table-responsive">
            <table class="table table-hover table-striped table-bordered table">
              <thead>
                <tr>
                  <th>Name</th>
                </tr>
              </thead>
              <tbody>
                ${courseInstances.map((courseInstance) => {
                  return html`
                    <tr>
                      <td>
                        <a
                          href="/pl/institution/${institution.id}/admin/course_instances/${courseInstance.id}"
                        >
                          ${courseInstance.long_name ?? '—'}: ${course.short_name ?? '—'}
                        </a>
                      </td>
                    </tr>
                  `;
                })}
              </tbody>
            </table>
          </div>
        </main>
      </body>
    </html>
  `.toString();
}
