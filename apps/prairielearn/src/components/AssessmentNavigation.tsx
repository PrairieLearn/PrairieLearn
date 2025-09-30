import { html } from '@prairielearn/html';

import type { Assessment, AssessmentSet } from '../lib/db-types.js';

import { Modal } from './Modal.js';
import type { NavSubPage } from './Navbar.types.js';

/**
 * Dropdown that lets users navigate between assessments in a
 * course instance.
 */
export function AssessmentNavigation({
  courseInstanceId,
  subPage,
  assessment,
  assessmentSet,
}: {
  courseInstanceId: string;
  subPage: NavSubPage;
  assessment: Assessment;
  assessmentSet: AssessmentSet;
}) {
  return html`
    <div class="bg-light pt-2 px-3">
      <button
        type="button"
        class="btn btn-ghost text-start"
        style="max-width: 100%;"
        aria-label="Change assessment"
        aria-haspopup="true"
        aria-expanded="false"
        hx-get="/pl/navbar/course_instance/${courseInstanceId}/assessment/${assessment.id}/switcher${subPage
          ? `?subPage=${subPage}`
          : ''}"
        hx-trigger="mouseover once, focus once, show.bs.dropdown once delay:200ms"
        data-bs-toggle="modal"
        data-bs-target="#assessmentNavigationModal"
        hx-target="#assessmentNavigationModalContent"
      >
        <span class="d-flex flex-row align-items-center gap-2 w-100">
          <span class="badge color-${assessmentSet.color}">
            ${assessmentSet.abbreviation}${assessment.number}
          </span>
          <span class="d-flex flex-column" style="min-width: 0;">
            <span class="d-flex align-items-center gap-1 dropdown-toggle">
              <span class="h6 mb-0 overflow-hidden text-truncate">${assessment.title}</span>
            </span>
            <span class="text-muted small overflow-hidden text-truncate">${assessment.tid}</span>
          </span>
        </span>
      </button>
      ${AssessmentNavigationModal()}
    </div>
  `;
}

function AssessmentNavigationModal() {
  return Modal({
    id: 'assessmentNavigationModal',
    title: 'Select assessment',
    form: false,
    body: html`
      <div id="assessmentNavigationModalContent">
        <div style="width: 100%;" class="d-flex justify-content-center align-items-center">
          <div class="spinner-border spinner-border-sm" role="status">
            <span class="visually-hidden">Loading assessments...</span>
          </div>
        </div>
      </div>
    `,
  });
}
