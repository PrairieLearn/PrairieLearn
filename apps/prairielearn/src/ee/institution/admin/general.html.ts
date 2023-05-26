import { z } from 'zod';
import { html, type HtmlValue } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';
import { type Institution } from '../../../lib/db-types';

export const InstitutionStatisticsSchema = z.object({
  course_count: z.number(),
  course_instance_count: z.number(),
  enrollment_count: z.number(),
});
type InstitutionStatistics = z.infer<typeof InstitutionStatisticsSchema>;

export function InstitutionAdminGeneral({
  institution,
  statistics,
  resLocals,
}: {
  institution: Institution;
  statistics: InstitutionStatistics;
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
            ${StatisticsCard({ title: 'Courses', value: statistics.course_count })}
            ${StatisticsCard({
              title: 'Course instances',
              value: statistics.course_instance_count,
            })}
            ${StatisticsCard({ title: 'Enrollments', value: statistics.enrollment_count })}
          </div>
        </main>
      </body>
    </html>
  `.toString();
}

function StatisticsCard({ title, value }: { title: string; value: HtmlValue }) {
  return html`
    <div class="card d-flex flex-column p-3 align-items-center">
      <span class="h4">${value}</span>
      <span class="text-muted">${title}</span>
    </div>
  `;
}
