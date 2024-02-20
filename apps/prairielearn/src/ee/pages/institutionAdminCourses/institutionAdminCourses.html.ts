import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';
import { type Course, type Institution } from '../../../lib/db-types';

export function InstitutionAdminCourses({
  institution,
  courses,
  resLocals,
}: {
  institution: Institution;
  courses: Course[];
  resLocals: Record<string, any>;
}) {
  return html`
    <!doctype html>
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
        <main class="container mb-4">
          <div class="table-responsive">
            <table class="table table-hover table-striped table-bordered table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Effective yearly enrollment limit</th>
                </tr>
              </thead>
              <tbody>
                ${courses.map((course) => {
                  return html`
                    <tr>
                      <td>
                        <a href="/pl/institution/${institution.id}/admin/course/${course.id}">
                          ${course.short_name ?? '—'}: ${course.title ?? '—'}
                        </a>
                      </td>
                      <td>
                        ${course.yearly_enrollment_limit ?? institution.yearly_enrollment_limit}
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
