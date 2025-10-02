import { html } from '@prairielearn/html';

import { PageLayout } from '../../../components/PageLayout.js';
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
  return PageLayout({
    resLocals: {
      ...resLocals,
      institution,
    },
    pageTitle: `Courses — ${institution.short_name}`,
    navContext: {
      type: 'institution',
      page: 'institution_admin',
      subPage: 'courses',
    },
    content: CoursesCard({ courses }),
  });
}

function CoursesCard({ courses }: { courses: Course[] }) {
  return html`
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
  `;
}
