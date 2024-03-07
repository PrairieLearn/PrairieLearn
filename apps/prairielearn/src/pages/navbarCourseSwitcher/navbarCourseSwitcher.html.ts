import { html } from '@prairielearn/html';

import { type Course } from '../../lib/db-types';
import { idsEqual } from '../../lib/id';

export function NavbarCourseSwitcher({
  courses,
  current_course_id,
  plainUrlPrefix,
}: {
  courses: Course[];
  current_course_id: string;
  plainUrlPrefix: string;
}) {
  return html`
    ${courses.map((c) => {
      return html`
        <a
          class="dropdown-item ${idsEqual(c.id, current_course_id) ? 'active' : ''}"
          href="${plainUrlPrefix}/course/${c.id}/course_admin"
        >
          ${c.short_name}
        </a>
      `;
    })}
  `.toString();
}
