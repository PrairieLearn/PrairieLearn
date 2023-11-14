import { html } from '@prairielearn/html';

import { type CourseInstance } from '../../lib/db-types';
import { idsEqual } from '../../lib/id';

// TODO: Once our `course_instances_with_staff_access` sproc is returning full
// course instance rows, use the full `CourseInstance` type here.
type CourseInstanceWithShortName = Pick<CourseInstance, 'id' | 'short_name'>;

export function NavbarCourseSwitcher() {
  return html`Hello, world`.toString();
}

export function NavbarCourseInstanceSwitcher({
  course_instances,
  current_course_instance_id,
  plainUrlPrefix,
}: {
  course_instances: CourseInstanceWithShortName[];
  current_course_instance_id: string;
  plainUrlPrefix: string;
}) {
  return html`
    ${course_instances.map((ci) => {
      return html`
        <a
          class="dropdown-item ${idsEqual(ci.id, current_course_instance_id) ? 'active' : ''}"
          href="${plainUrlPrefix}/course_instance/${ci.id}/instructor/instance_admin"
        >
          ${ci.short_name}
        </a>
      `;
    })}
  `.toString();
}
