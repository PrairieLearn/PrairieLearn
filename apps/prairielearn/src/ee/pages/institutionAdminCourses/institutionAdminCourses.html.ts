import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

import { type Course, type Institution } from '../../../lib/db-types.js';

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
        ${renderEjs(import.meta.url, "<%- include('../../../pages/partials/head')%>", {
          ...resLocals,
          pageTitle: `Courses — ${institution.short_name}`,
        })}
      </head>
      <body>
        ${renderEjs(import.meta.url, "<%- include('../../../pages/partials/navbar') %>", {
          ...resLocals,
          institution,
          navbarType: 'institution',
          navPage: 'institution_admin',
          navSubPage: 'courses',
        })}
        <main class="container mb-4">
          <ul class="list-group">
            ${courses.map(
              (course) => html`
                <li class="list-group-item">
                  <a href="/pl/course/${course.id}/course_admin">
                    ${course.short_name}: ${course.title}
                  </a>
                </li>
              `,
            )}
          </ul>
        </main>
      </body>
    </html>
  `.toString();
}
