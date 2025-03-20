import { html } from '@prairielearn/html';

import type { Assessment } from '../lib/db-types.js';

import type { NavSubPage } from './Navbar.types.js';

/**
 * Dropdown that lets users navigate between assessments in a
 * course instance.
 */
export function AssessmentNavigation({
  courseInstanceId,
  subPage,
  assessment,
}: {
  courseInstanceId: string;
  subPage: NavSubPage;
  assessment: Assessment;
}) {
  return html`
    <div class="dropdown bg-light pt-2 px-3">
      <button
        type="button"
        class="btn btn-ghost dropdown-toggle dropdown-menu-right d-flex justify-content-between align-items-center"
        style="max-width: 100%;"
        aria-label="Change assessment"
        aria-haspopup="true"
        aria-expanded="false"
        data-bs-toggle="dropdown"
        data-bs-boundary="window"
        hx-get="/pl/course_instance/${courseInstanceId}/instructor/assessment/${assessment.id}/assessments_switcher${subPage ? `?subPage=${subPage}` : ''}"
        hx-trigger="mouseover once, focus once, show.bs.dropdown once delay:200ms"
        hx-target="#assessmentNavigationDropdownContent"
      >
        <span class="h6 mb-0 me-1 overflow-hidden text-truncate">${assessment.title}</span>
      </button>
      <div class="dropdown-menu py-0 overflow-hidden">
        <div
          id="assessmentNavigationDropdownContent"
          style="max-height: 50vh"
          class="overflow-auto py-2"
        >
          <div class="d-flex justify-content-center">
            <div class="spinner-border spinner-border-sm" role="status">
              <span class="visually-hidden">Loading assessments...</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}
