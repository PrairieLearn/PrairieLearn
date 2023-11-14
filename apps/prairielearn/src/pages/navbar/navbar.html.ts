import { html } from '@prairielearn/html';

import { type CourseInstance } from '../../lib/db-types';
import { idsEqual } from '../../lib/id';
import { Course } from '../../lib/db-types';

// TODO: Once our `course_instances_with_staff_access` sproc is returning full
// course instance rows, use the full `CourseInstance` type here.
type CourseInstanceWithShortName = Pick<CourseInstance, 'id' | 'short_name'>;

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

export function NavbarCourseInstanceSwitcher({
  course_instances,
  current_course_instance_id,
  plainUrlPrefix,
}: {
  course_instances: CourseInstanceWithShortName[];
  current_course_instance_id: string | null;
  plainUrlPrefix: string;
}) {
  return html`
    ${course_instances.map((ci) => {
      const isActive = current_course_instance_id && idsEqual(ci.id, current_course_instance_id);
      return html`
        <a
          class="dropdown-item ${isActive ? 'active' : ''}"
          href="${plainUrlPrefix}/course_instance/${ci.id}/instructor/instance_admin"
        >
          ${ci.short_name}
        </a>
      `;
    })}
  `.toString();
}
