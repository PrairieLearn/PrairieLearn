import { html } from '@prairielearn/html';

import type { Assessment, CourseInstance } from '../lib/db-types.js';

/**
 * Dropdown that lets users navigate between assessments in a
 * course instance.
 */
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
    <div class="dropdown p-3 bg-light pb-2">
      <button
        type="button"
        style="min-width: 25%; max-width: 100%;"
        class="btn w-fit dropdown-toggle dropdown-menu-right border border-gray bg-white d-flex justify-content-between align-items-center"
        data-toggle="dropdown"
        aria-haspopup="true"
        aria-expanded="false"
        data-boundary="window"
      >
        <span class="overflow-hidden text-truncate"> ${assessment.title} </span>
      </button>
      <div class="dropdown-menu py-0 overflow-hidden">
        <div style="max-height: 50vh" class="overflow-auto">
          ${assessments.map((a) => {
            return html`
              <a
                class="dropdown-item ${`${assessment.id}` === `${a.id}` ? 'active' : ''}"
                aria-current="${`${assessment.id}` === `${a.id}` ? 'page' : ''}"
                href="/pl/course_instance/${courseInstance.id}/instructor/assessment/${a.id}"
              >
                ${a.title}
              </a>
            `;
          })}
        </div>
      </div>
    </div>
  `;
}
