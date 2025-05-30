import { html } from '@prairielearn/html';

import type { Assessment, AssessmentSet } from '../lib/db-types.js';

import { Modal } from './Modal.html.js';
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
    <div class="dropdown bg-light pt-2 px-3">
      <button
        type="button"
        class="btn btn-ghost dropdown-toggle dropdown-menu-right d-flex justify-content-between align-items-center gap-1"
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
        <span class="badge top-0 color-${assessmentSet.color}"
          >${assessmentSet.abbreviation}${assessment.number}</span
        >
        <span class="h6 mb-0 me-1 overflow-hidden text-truncate"
          >${assessment.title} (${assessment.tid})</span
        >
      </button>
      ${AssessmentNavigationModal()}
    </div>
  `;
}

function AssessmentNavigationModal() {
  return Modal({
    id: 'assessmentNavigationModal',
    title: 'Select assessment',
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
