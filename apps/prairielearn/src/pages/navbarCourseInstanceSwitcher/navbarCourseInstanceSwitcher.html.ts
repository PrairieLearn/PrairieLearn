import { html } from '@prairielearn/html';

import { type CourseInstance } from '../../lib/db-types.js';
import { idsEqual } from '../../lib/id.js';

export function NavbarCourseInstanceSwitcher({
  course_instances,
  current_course_instance_id,
  plainUrlPrefix,
}: {
  course_instances: CourseInstance[];
  current_course_instance_id: string | null;
  plainUrlPrefix: string;
}) {
  if (course_instances.length === 0) {
    return html`
      <button class="dropdown-item disabled" disabled>No course instances</button>
    `.toString();
  }

  return html`
    ${course_instances.map((ci) => {
      const isActive = current_course_instance_id && idsEqual(ci.id, current_course_instance_id);
      return html`
        <a
          class="dropdown-item ${isActive ? 'active' : ''}"
          aria-current="${isActive ? 'page' : ''}"
          href="${plainUrlPrefix}/course_instance/${ci.id}/instructor/instance_admin"
        >
          ${ci.short_name}
        </a>
      `;
    })}
  `.toString();
}
