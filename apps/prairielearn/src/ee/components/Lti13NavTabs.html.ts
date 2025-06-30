import clsx from 'clsx';

import { html } from '@prairielearn/html';

import type { CourseInstance, Lti13CourseInstance } from '../../lib/db-types.js';

export function Lti13NavTabs({
  course_instance,
  lti13_course_instance,
  page,
}: {
  course_instance: CourseInstance;
  lti13_course_instance: Lti13CourseInstance;
  page: 'assessments' | 'settings';
}) {
  const assessmentsUrl = `/pl/course_instance/${course_instance.id}/instructor/instance_admin/lti13_instance/${lti13_course_instance.id}`;
  const settingsUrl = `${assessmentsUrl}/settings`;
  return html`
    <ul class="nav nav-tabs pl-nav-tabs-bar pt-2 px-3 bg-light">
      <li class="nav-item">
        <a
          class="${clsx(
            'nav-link',
            page === 'assessments' ? 'active text-dark' : 'text-secondary',
          )}"
          href="${assessmentsUrl}"
        >
          <i class="me-1 fa fa-list"></i>
          Assessments
        </a>
      </li>
      <li class="nav-item">
        <a
          class="${clsx('nav-link', page === 'settings' ? 'active text-dark' : 'text-secondary')}"
          href="${settingsUrl}"
        >
          <i class="me-1 fa fa-cog"></i>
          Settings</a
        >
      </li>
    </ul>
  `;
}
