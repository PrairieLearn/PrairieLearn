import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';
import { type Course, type Institution } from '../../../lib/db-types.js';

export function AdministratorInstitutionCourses({
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
        ${renderEjs(import.meta.url, "<%- include('../../../pages/partials/head')%>", {
          ...resLocals,
          navPage: 'administrator_institution',
          pageTitle: 'Courses',
        })}
      </head>
      <body>
        ${renderEjs(import.meta.url, "<%- include('../../../pages/partials/navbar') %>", {
          ...resLocals,
          institution,
          navbarType: 'administrator_institution',
          navPage: 'administrator_institution',
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
                        <a
                          href="/pl/administrator/institution/${institution.id}/course/${course.id}"
                        >
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
