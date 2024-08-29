import { html } from '@prairielearn/html';

import { HeadContents } from '../../../components/HeadContents.html.js';
import { Navbar } from '../../../components/Navbar.html.js';
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
        ${HeadContents({ resLocals, pageTitle: 'Courses - Institution Admin' })}
      </head>
      <body>
        ${Navbar({
          resLocals: { ...resLocals, institution },
          navbarType: 'administrator_institution',
          navPage: 'administrator_institution',
          navSubPage: 'courses',
        })}
        <main id="content" class="container mb-4">
          <div class="table-responsive">
            <table
              class="table table-hover table-striped table-bordered table"
              aria-label="Courses"
            >
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
