import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

export function General({
  institution,
  courseCount,
  courseInstanceCount,
  enrollmentCount,
  resLocals,
}: {
  institution: any;
  courseCount: number;
  courseInstanceCount: number;
  enrollmentCount: number;
  resLocals: Record<string, any>;
}) {
  return html`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        ${renderEjs(__filename, "<%- include('../../../pages/partials/head')%>", {
          ...resLocals,
          navPage: 'institution_admin',
          pageTitle: 'General',
        })}
        <style>
          .card-grid {
            display: grid;
            grid-template-columns: repeat(1, 1fr);
            gap: 1rem;
          }

          @media (min-width: 768px) {
            .card-grid {
              grid-template-columns: repeat(3, 1fr);
            }
          }
        </style>
      </head>
      <body>
        ${renderEjs(__filename, "<%- include('../../../pages/partials/navbar') %>", {
          ...resLocals,
          institution,
          navbarType: 'institution',
          navPage: 'institution_admin',
          navSubPage: 'general',
        })}
        <main class="container mb-4">
          <h2 class="h4">Statistics</h2>
          <div class="card-grid">
            ${StatisticsCard({ title: 'Courses', value: courseCount })}
            ${StatisticsCard({ title: 'Course instances', value: courseInstanceCount })}
            ${StatisticsCard({ title: 'Enrollments', value: enrollmentCount })}
          </div>
        </main>
      </body>
    </html>
  `.toString();
}

function StatisticsCard({ title, value }: { title: string; value: any }) {
  return html`
    <div class="card d-flex flex-column p-3 align-items-center">
      <span class="h4">${value}</span>
      <span class="text-muted">${title}</span>
    </div>
  `;
}
