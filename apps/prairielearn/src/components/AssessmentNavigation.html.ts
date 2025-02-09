import { html } from '@prairielearn/html';

import type { Assessment, CourseInstance } from '../lib/db-types.js';

export function AssessmentNavigation({
  courseInstance,
  assessment,
  assessments,
}: {
  courseInstance: CourseInstance;
  assessment: Assessment;
  assessments: Assessment[];
}) {
  return html`
    <div class="dropdown">
      <button
        type="button"
        class="btn btn-lg w-25 dropdown-toggle dropdown-menu-right border border-gray bg-white d-flex justify-content-between align-items-center"
        data-toggle="dropdown"
        aria-haspopup="true"
        aria-expanded="false"
        data-boundary="window"
      >
        <span> ${assessment.title} </span>
      </button>
      <div class="dropdown-menu">
        ${assessments.map((a) => {
          return html`
            <a
              class="dropdown-item ${`${assessment.id}` === `${a.id}` ? 'active' : ''}"
              href="/pl/course_instance/${courseInstance.id}/instructor/assessment/${a.id}"
            >
              ${a.title}
            </a>
          `;
        })}
      </div>
    </div>
  `;
}
