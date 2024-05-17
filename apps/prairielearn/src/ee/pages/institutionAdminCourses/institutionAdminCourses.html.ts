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
          <div class="card mb-4">
            <div class="card-header bg-primary text-white d-flex align-items-center">Courses</div>
            ${courses.length === 0
              ? html`
                  <div class="card-body">
                    <div class="text-center text-muted">No courses</div>
                  </div>
                `
              : html`
                  <ul class="list-group list-group-flush">
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
                `}
          </div>
        </main>
      </body>
    </html>
  `.toString();
}
